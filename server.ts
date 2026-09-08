import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Local dev only — Vercel injects its own env vars in production. Loads server-only
// secrets (SUPABASE_SERVICE_ROLE_KEY, WHATSAPP_VERIFY_TOKEN, CRON_SECRET, etc.) from
// .env.local into process.env; Vite separately auto-loads VITE_-prefixed vars for the
// client bundle, so this only needs to cover the non-VITE_ server-side half.
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.env.local'), quiet: true });

import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  seedConversationFromLead,
  verifyWhatsAppWebhook,
  processWhatsAppWebhookPayload,
} from './lib/whatsappWebhookHandler';
import { getSupabaseAdmin } from './lib/supabaseAdmin';
import { getOrgIdFromAuthHeader } from './lib/supabaseServerAuth';
import { buildGoogleAuthUrl, handleGoogleOAuthCallback, isGoogleOAuthConfigured } from './lib/googleOAuthFlow';
import { parseMultipartFields } from './lib/parseMultipart';
import { verifyEmailWebhookToken, processInboundEmail, seedEmailConversationFromLead, buildEmailReplyToAddress } from './lib/emailWebhookHandler';
import { sendCampaignWhatsAppMessage } from './lib/whatsappCampaignSender';
import { sendEmailViaOrgProvider } from './lib/emailSender';
import { getOrgChannelSettings } from './lib/orgSettings';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// In-Memory Dispatch Logs for Outreach Monitoring & Audit
interface OutreachDispatchLog {
  id: string;
  leadId: string;
  leadName: string;
  recipient: string;
  channel: 'whatsapp' | 'email';
  status: 'sent' | 'delivered' | 'failed';
  timestamp: string;
  subject?: string;
  preview: string;
  directUrl?: string;
}

const dispatchLogs: OutreachDispatchLog[] = [];

// Initialize Gemini Client
let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Helper: Format fallback templates
function interpolate(
  template: string | undefined,
  variables: Record<string, string>
): string {
  if (!template) return '';
  let res = template;
  for (const [k, v] of Object.entries(variables)) {
    res = res.replace(new RegExp(`{{${k}}}`, 'gi'), v || '');
  }
  return res;
}

// API Route: AI-Personalized WhatsApp & Email Generator
app.post('/api/outreach/generate-message', async (req, res) => {
  try {
    const { lead, settings, template, availableSlots } = req.body;
    const ai = getGenAI();

    const firstName = (lead?.name || 'there').split(' ')[0];
    const companyName = settings?.companyName || 'our company';
    const senderName = settings?.senderName || 'our team';
    const senderEmail = settings?.senderEmail || '';
    const senderPhone = settings?.senderPhone || '';
    const clientCompany = lead?.company || 'your team';
    const leadNotes = lead?.notes || '';

    const nextSlot = (availableSlots || []).find((s: { available: boolean }) => s.available) || availableSlots?.[0];
    const bookingLink = nextSlot
      ? `https://calendar.google.com/booking?date=${nextSlot.date}&slot=${encodeURIComponent(nextSlot.time)}`
      : 'https://meet.google.com/demo-slot';

    const vars: Record<string, string> = {
      name: lead?.name || 'there',
      first_name: firstName,
      company: clientCompany,
      email: lead?.email || '',
      phone: lead?.phone || '',
      company_name: companyName,
      sender_name: senderName,
      sender_email: senderEmail,
      sender_phone: senderPhone,
      booking_link: bookingLink,
    };

    if (ai) {
      try {
        const prompt = `You are a world-class B2B copywriter specialized in high-converting WhatsApp messages and cold/warm outreach emails.
Generate a personalized WhatsApp message AND Email for this prospect:
- Client Name: ${lead?.name}
- Client Company: ${clientCompany}
- Client Email: ${lead?.email}
- Client Phone: ${lead?.phone}
- Context/Notes from spreadsheet: "${leadNotes}"
- Sender Company: ${companyName}
- Sender Name: ${senderName}
- Offering/Value Prop: ${settings?.serviceDescription || 'Outreach automation synced with Google Calendar and spreadsheets'}
- Booking Link: ${bookingLink}
- Custom Instructions: "${settings?.customInstructions || 'Keep it friendly, high-value, crisp, and direct.'}"
${template ? `- Base Template Guidance:\nWhatsApp Base: ${template.whatsAppContent}\nEmail Subject Base: ${template.emailSubject}\nEmail Body Base: ${template.emailBody}` : ''}

Output strict JSON with these 3 keys:
{
  "whatsApp": "A concise, engaging WhatsApp message formatted with natural emojis, bolding (*text*), and the booking link ${bookingLink}",
  "emailSubject": "High-open rate email subject line (under 60 chars)",
  "emailBody": "Clear, professional, punchy email with greeting, value prop, bullet points, call to action with booking link, and sender sign-off"
}`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        let parsed: { whatsApp?: string; emailSubject?: string; emailBody?: string } = {};
        try {
          parsed = JSON.parse(response.text || '{}');
        } catch {
          parsed = {};
        }

        if (parsed.whatsApp && parsed.emailSubject && parsed.emailBody) {
          return res.json({
            whatsApp: parsed.whatsApp,
            emailSubject: parsed.emailSubject,
            emailBody: parsed.emailBody,
            isAiGenerated: true,
          });
        }
      } catch (aiErr) {
        console.warn('Gemini generateContent error in server.ts, falling back:', aiErr);
      }
    }

    // Fallback template interpolation
    if (template) {
      return res.json({
        whatsApp: interpolate(template.whatsAppContent, vars),
        emailSubject: interpolate(template.emailSubject, vars),
        emailBody: interpolate(template.emailBody, vars),
        isAiGenerated: false,
      });
    }

    // Standard fallback
    return res.json({
      whatsApp: `Hi ${firstName} 👋! ${senderName} from ${companyName} here. We noticed your work at *${clientCompany}* and wanted to share how you can automate client outreach directly from spreadsheets. Open to a 10-min demo? Grab a slot here: ${bookingLink}`,
      emailSubject: `Automating outreach workflow for ${clientCompany} (10-min Demo)`,
      emailBody: `Hi ${firstName},\n\nI hope you're having a productive week.\n\nI'm reaching out from ${companyName}. We help teams at ${clientCompany} eliminate manual messaging by connecting spreadsheets directly to automated WhatsApp and Email dispatch.\n\nWould you be open to a brief 10-minute introduction this week?\n\nPick a convenient time here:\n👉 ${bookingLink}\n\nBest regards,\n${senderName}\n${companyName}`,
      isAiGenerated: false,
    });
  } catch (error) {
    console.warn('Error in /api/outreach/generate-message:', error);
    res.status(500).json({ error: 'Failed to generate message' });
  }
});

// API Route: AI Auto-Reply to Incoming WhatsApp / Email Messages
app.post('/api/ai/auto-reply', async (req, res) => {
  try {
    const { incomingMessage, lead, settings, availableSlots } = req.body;
    const ai = getGenAI();

    const clientName = lead?.name || 'there';
    const firstName = clientName.split(' ')[0];
    const companyName = settings?.companyName || 'our company';
    const nextSlot = (availableSlots || []).find((s: { available: boolean }) => s.available) || availableSlots?.[0];
    const bookingLink = nextSlot
      ? `https://calendar.google.com/booking?date=${nextSlot.date}&slot=${encodeURIComponent(nextSlot.time)}`
      : 'https://meet.google.com/demo-slot';

    if (ai && incomingMessage) {
      const prompt = `A client named ${clientName} at company ${lead?.company || 'their firm'} replied to our outreach with:
"${incomingMessage}"

Our company: ${companyName}
Our value prop: ${settings?.serviceDescription || 'AI outreach and calendar booking automation'}
Booking Link: ${bookingLink}

Generate a concise, helpful, polite, and persuasive response (under 75 words).
- If they are interested or asking for times: provide the booking link ${bookingLink}.
- If they ask about pricing or features: answer positively with general context and invite them to the 10-minute demo via ${bookingLink}.
- If they say not interested or unsubscribe: acknowledge politely and confirm they are opted out.

Return strict JSON:
{
  "reply": "The response message text"
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });

      try {
        const parsed = JSON.parse(response.text || '{}');
        if (parsed.reply) {
          return res.json({ reply: parsed.reply });
        }
      } catch {}
    }

    const lower = (incomingMessage || '').toLowerCase();
    if (lower.includes('price') || lower.includes('cost')) {
      return res.json({
        reply: `Our pricing scales flexibly with your contact volume. We'd love to show you a quick breakdown for ${lead?.company || 'your team'} on a 10-minute call: ${bookingLink}`,
      });
    }

    if (lower.includes('yes') || lower.includes('sure') || lower.includes('demo') || lower.includes('link')) {
      return res.json({
        reply: `Awesome, ${firstName}! You can choose any open time that fits your calendar here: ${bookingLink}. Looking forward to connecting!`,
      });
    }

    return res.json({
      reply: `Thanks for the response, ${firstName}! Would Thursday at 11:00 AM or Friday at 3:00 PM work for a quick walk-through? Or pick any time here: ${bookingLink}`,
    });
  } catch (err) {
    console.error('Error in /api/ai/auto-reply:', err);
    res.status(500).json({ error: 'Failed to generate auto-reply' });
  }
});

// API Route: WhatsApp Dispatch Endpoint
app.post('/api/outreach/send-whatsapp', async (req, res) => {
  try {
    const { lead, messageText, channelSettings, webhookUrl, templateParams, campaignRecipientId } = req.body;
    const orgId = await getOrgIdFromAuthHeader(req.headers.authorization);

    const result = await sendCampaignWhatsAppMessage(channelSettings, {
      toPhone: lead?.phone || '',
      messageText,
      templateParams,
      webhookUrl,
      webhookContext: lead,
    });

    if (result.provider === 'cloud_api' && result.delivered && orgId) {
      seedConversationFromLead(orgId, lead || {}, campaignRecipientId).catch(() => {});
    }

    const logEntry: OutreachDispatchLog = {
      id: `wa-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      leadId: lead?.id || 'lead',
      leadName: lead?.name || 'Contact',
      recipient: lead?.phone || '',
      channel: 'whatsapp',
      status: result.delivered ? 'delivered' : 'failed',
      timestamp: new Date().toISOString(),
      preview: (messageText || '').substring(0, 90) + '...',
      directUrl: result.directUrl,
    };

    dispatchLogs.unshift(logEntry);
    if (dispatchLogs.length > 100) dispatchLogs.pop();

    res.json({
      success: true,
      delivered: result.delivered,
      provider: result.provider,
      providerResponse: result.providerResponse,
      errorDetail: result.errorDetail,
      directUrl: result.directUrl,
      log: logEntry,
    });
  } catch (error: any) {
    console.error('WhatsApp send error:', error);
    res.status(500).json({ error: error.message || 'Failed to dispatch WhatsApp message' });
  }
});

// API Route: Email Dispatch Endpoint
app.post('/api/outreach/send-email', async (req, res) => {
  try {
    const { lead, subject, body, channelSettings, webhookUrl, senderName, senderEmail, campaignRecipientId } = req.body;
    const orgId = await getOrgIdFromAuthHeader(req.headers.authorization);
    const replyTo = buildEmailReplyToAddress(campaignRecipientId) || undefined;

    const mailtoUrl = `mailto:${lead?.email || ''}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body || '')}`;

    const result = await sendEmailViaOrgProvider(channelSettings, {
      to: lead?.email || '',
      toName: lead?.name,
      subject: subject || 'Meeting Request',
      body: body || '',
      fromName: senderName || 'OmniReach AI',
      fromAddress: senderEmail,
      replyTo,
      webhookUrl,
      webhookContext: lead,
    });

    if (result.ok && orgId && replyTo) {
      seedEmailConversationFromLead(orgId, lead || {}, campaignRecipientId, subject).catch(() => {});
    }

    const logEntry: OutreachDispatchLog = {
      id: `em-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      leadId: lead?.id || 'lead',
      leadName: lead?.name || 'Contact',
      recipient: lead?.email || '',
      channel: 'email',
      status: result.ok ? 'delivered' : 'failed',
      timestamp: new Date().toISOString(),
      subject,
      preview: (body || '').substring(0, 90) + '...',
      directUrl: mailtoUrl,
    };

    dispatchLogs.unshift(logEntry);
    if (dispatchLogs.length > 100) dispatchLogs.pop();

    res.json({
      success: true,
      delivered: result.ok,
      provider: result.provider,
      providerResponse: result.providerResponse,
      errorDetail: result.error || null,
      mailtoUrl,
      log: logEntry,
    });
  } catch (error: any) {
    console.error('Email send error:', error);
    res.status(500).json({ error: error.message || 'Failed to dispatch Email' });
  }
});

// API Route: Calendar Booking & Google Meet Link Generator
app.post('/api/calendar/book', async (req, res) => {
  try {
    const { slotId, date, time, lead } = req.body;
    const meetCode = `${Math.random().toString(36).substring(2, 5)}-${Math.random().toString(36).substring(2, 6)}-${Math.random().toString(36).substring(2, 5)}`;
    const meetLink = `https://meet.google.com/${meetCode}`;

    res.json({
      success: true,
      bookingId: `gcal-${Date.now()}`,
      meetLink,
      date,
      time,
      clientName: lead?.name,
      clientEmail: lead?.email,
      confirmedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    res.status(500).json({ error: err.message || 'Failed to book calendar slot' });
  }
});

// API Route: Get Outreach Dispatch Logs
app.get('/api/outreach/logs', (req, res) => {
  res.json({ logs: dispatchLogs });
});

// WhatsApp Webhook Verification — Meta calls this once when you register the webhook URL
app.get('/api/whatsapp/webhook', (req, res) => {
  const result = verifyWhatsAppWebhook(req.query as Record<string, unknown>);
  if (result) {
    res.status(200).send(result.challenge);
  } else {
    res.sendStatus(403);
  }
});

// WhatsApp Webhook Receiver — incoming prospect replies, handled by the AI booking bot
app.post('/api/whatsapp/webhook', async (req, res) => {
  res.sendStatus(200); // ack immediately; Meta requires a fast response
  try {
    await processWhatsAppWebhookPayload(req.body);
  } catch (err) {
    console.error('[WhatsApp Webhook] Processing error:', err);
  }
});

// Email Webhook Receiver — SendGrid Inbound Parse posts replies as multipart/form-data;
// our own Cloudflare Email Worker (see cloudflare/email-worker/) posts JSON instead.
// Configure the Destination URL as: https://<domain>/api/email/inbound?token=<EMAIL_INBOUND_WEBHOOK_SECRET>
app.post('/api/email/inbound', async (req, res) => {
  if (!verifyEmailWebhookToken(req.query.token as string | undefined)) {
    return res.sendStatus(403);
  }
  res.sendStatus(200); // ack immediately; SendGrid retries on slow/non-2xx responses
  try {
    const contentType = req.headers['content-type'] || '';
    let fields: Record<string, string>;
    if (contentType.includes('application/json')) {
      // express.json() middleware already parsed this into req.body (and drained the stream).
      const body = req.body || {};
      fields = {};
      for (const key of ['to', 'from', 'subject', 'text', 'html']) {
        if (typeof body[key] === 'string') fields[key] = body[key];
      }
    } else {
      fields = await parseMultipartFields(req);
    }
    await processInboundEmail(fields);
  } catch (err) {
    console.error('[Email Webhook] Processing error:', err);
  }
});

// Headless dispatcher for country-peak-time-scheduled campaign sends — see
// api/cron/dispatch-scheduled.ts for the Vercel serverless twin (same logic, kept in
// sync manually since server.ts is Express-only local dev, not auto-discovered by Vercel).
app.get('/api/cron/dispatch-scheduled', async (req, res) => {
  const expected = process.env.CRON_SECRET;
  const authHeader = (req.headers.authorization as string | undefined) || '';
  const tokenOk = !!expected && (authHeader === `Bearer ${expected}` || req.query.token === expected);
  if (!tokenOk) {
    return res.status(403).json({ error: 'Invalid dispatch token' });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.json({ processed: 0, note: 'Supabase not configured' });
  }

  const BATCH_SIZE = 25;
  const nowIso = new Date().toISOString();
  const { data: due, error } = await supabase
    .from('campaign_recipients')
    .select('id, org_id, campaign_id, client_id, whatsapp_status, email_status, payload, campaigns(status), clients(*)')
    .lte('scheduled_for', nowIso)
    .or('whatsapp_status.eq.Queued,email_status.eq.Queued')
    .limit(BATCH_SIZE);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const settingsCache = new Map<string, any>();

  for (const row of due || []) {
    const campaign: any = Array.isArray((row as any).campaigns) ? (row as any).campaigns[0] : (row as any).campaigns;
    const client: any = Array.isArray((row as any).clients) ? (row as any).clients[0] : (row as any).clients;
    if (!campaign || campaign.status !== 'running' || !client) {
      skipped++;
      continue;
    }

    if (!settingsCache.has(row.org_id)) {
      settingsCache.set(row.org_id, await getOrgChannelSettings(row.org_id));
    }
    const channelSettings = settingsCache.get(row.org_id);
    const payload: any = row.payload || {};

    if (row.whatsapp_status === 'Queued') {
      const { data: claimed } = await supabase
        .from('campaign_recipients')
        .update({ whatsapp_status: 'Sending' })
        .eq('id', row.id)
        .eq('whatsapp_status', 'Queued')
        .select('id');

      if (claimed && claimed.length > 0) {
        const result = await sendCampaignWhatsAppMessage(channelSettings, {
          toPhone: client.phone || '',
          messageText: payload.whatsappMessage || '',
          templateParams: payload.templateParams,
        });
        await supabase
          .from('campaign_recipients')
          .update({
            whatsapp_status: result.delivered ? 'Sent' : 'Failed',
            error_detail: result.errorDetail || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);

        if (result.delivered) {
          sent++;
          if (result.provider === 'cloud_api') {
            seedConversationFromLead(row.org_id, client, row.id).catch(() => {});
          }
        } else {
          failed++;
        }
      }
    }

    if (row.email_status === 'Queued') {
      const { data: claimed } = await supabase
        .from('campaign_recipients')
        .update({ email_status: 'Sending' })
        .eq('id', row.id)
        .eq('email_status', 'Queued')
        .select('id');

      if (claimed && claimed.length > 0) {
        const replyTo = buildEmailReplyToAddress(row.id) || undefined;
        const result = await sendEmailViaOrgProvider(channelSettings, {
          to: client.email || '',
          toName: client.name,
          subject: payload.emailSubject || 'Meeting Request',
          body: payload.emailBody || '',
          fromName: payload.senderName || 'OmniReach AI',
          fromAddress: payload.senderEmail,
          replyTo,
        });
        await supabase
          .from('campaign_recipients')
          .update({
            email_status: result.ok ? 'Sent' : 'Failed',
            error_detail: result.error || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);

        if (result.ok) {
          sent++;
          if (replyTo) {
            seedEmailConversationFromLead(row.org_id, client, row.id, payload.emailSubject).catch(() => {});
          }
        } else {
          failed++;
        }
      }
    }
  }

  res.json({ processed: (due || []).length, sent, failed, skipped });
});

// API Route: List live AI bot conversations for the signed-in org (for the "AI Inbox" UI panel)
app.get('/api/whatsapp/conversations', async (req, res) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.json({ configured: false, conversations: [] });
  }
  const orgId = await getOrgIdFromAuthHeader(req.headers.authorization);
  if (!orgId) {
    return res.status(401).json({ error: 'Sign in required.' });
  }
  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('org_id', orgId)
    .order('last_message_at', { ascending: false })
    .limit(200);
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json({ configured: true, conversations: data });
});

// API Route: List live AI email bot conversations for the signed-in org
app.get('/api/email/conversations', async (req, res) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.json({ configured: false, conversations: [] });
  }
  const orgId = await getOrgIdFromAuthHeader(req.headers.authorization);
  if (!orgId) {
    return res.status(401).json({ error: 'Sign in required.' });
  }
  const { data, error } = await supabase
    .from('email_conversations')
    .select('*')
    .eq('org_id', orgId)
    .order('last_message_at', { ascending: false })
    .limit(200);
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json({ configured: true, conversations: data });
});

// API Route: Start the Google Calendar "Connect" OAuth flow for the signed-in org
app.post('/api/auth/google/connect', async (req, res) => {
  if (!isGoogleOAuthConfigured()) {
    return res.status(500).json({ error: 'Google Calendar OAuth is not configured on the server yet.' });
  }
  const orgId = await getOrgIdFromAuthHeader(req.headers.authorization);
  if (!orgId) {
    return res.status(401).json({ error: 'Sign in required.' });
  }
  const authUrl = buildGoogleAuthUrl(orgId);
  if (!authUrl) {
    return res.status(500).json({ error: 'Failed to build Google authorization URL.' });
  }
  res.json({ authUrl });
});

// API Route: Google OAuth redirect target — exchanges the code and stores the org's refresh token
app.get('/api/auth/google/callback', async (req, res) => {
  const result = await handleGoogleOAuthCallback(req.query.code as string | undefined, req.query.state as string | undefined);
  const redirectTo = result.ok
    ? `/?google_calendar=connected`
    : `/?google_calendar=error&message=${encodeURIComponent(result.error || 'Connection failed')}`;
  res.redirect(302, redirectTo);
});

// Health Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    mode: 'whatsapp_email_outreach',
    timestamp: new Date().toISOString(),
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
