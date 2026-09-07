import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import nodemailer from 'nodemailer';
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

    const phoneDigits = (lead?.phone || '').replace(/\D/g, '');
    const directUrl = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(messageText || '')}`;

    let delivered = false;
    let providerResponse: any = null;
    let errorDetail: string | null = null;

    const provider = channelSettings?.whatsAppProvider || 'web_direct';
    const useTemplate = channelSettings?.whatsappMessageMode === 'template';

    // 1. Twilio WhatsApp API
    if (provider === 'twilio' && channelSettings?.twilioAccountSid && channelSettings?.twilioAuthToken) {
      if (useTemplate && !channelSettings.twilioContentSid) {
        errorDetail = 'Template mode is on but no Twilio Content SID is configured. Please add one in Settings.';
      } else {
        try {
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${channelSettings.twilioAccountSid}/Messages.json`;
          const fromNumber = channelSettings.twilioFromNumber || '+14155238886'; // default Twilio sandbox number
          const formattedFrom = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;
          const formattedTo = `whatsapp:+${phoneDigits}`;

          const formData = new URLSearchParams();
          formData.append('From', formattedFrom);
          formData.append('To', formattedTo);

          if (useTemplate) {
            formData.append('ContentSid', channelSettings.twilioContentSid.trim());
            if (Array.isArray(templateParams) && templateParams.length > 0) {
              const contentVariables: Record<string, string> = {};
              templateParams.forEach((val: string, idx: number) => {
                contentVariables[String(idx + 1)] = val;
              });
              formData.append('ContentVariables', JSON.stringify(contentVariables));
            }
          } else {
            formData.append('Body', messageText || '');
          }

          const authHeader = `Basic ${Buffer.from(`${channelSettings.twilioAccountSid}:${channelSettings.twilioAuthToken}`).toString('base64')}`;

          const twilioRes = await fetch(twilioUrl, {
            method: 'POST',
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString(),
          });

          const twilioData = await twilioRes.json();
          if (twilioRes.ok) {
            delivered = true;
            providerResponse = { provider: 'twilio', sid: twilioData.sid, status: twilioData.status };
            console.log(`[Twilio] Delivered to ${lead?.phone} — sid: ${twilioData.sid}`);
          } else {
            errorDetail = twilioData.message || 'Twilio API returned an error';
            providerResponse = twilioData;
            console.warn(`[Twilio] FAILED to ${lead?.phone} — ${JSON.stringify(twilioData)}`);
          }
        } catch (err: any) {
          errorDetail = err.message || 'Failed connecting to Twilio';
        }
      }
    }
    // 2. Meta WhatsApp Cloud API
    else if (provider === 'cloud_api' && channelSettings?.whatsappCloudApiKey && channelSettings?.whatsappCloudPhoneId) {
      if (useTemplate && !channelSettings.whatsappTemplateName) {
        errorDetail = 'Template mode is on but no approved template name is configured. Please add one in Settings.';
      } else {
        try {
          const phoneId = channelSettings.whatsappCloudPhoneId.trim();
          const metaUrl = `https://graph.facebook.com/v25.0/${phoneId}/messages`;

          const messageBody = useTemplate
            ? {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneDigits,
                type: 'template',
                template: {
                  name: channelSettings.whatsappTemplateName.trim(),
                  language: { code: channelSettings.whatsappTemplateLanguage || 'en_US' },
                  ...(Array.isArray(templateParams) && templateParams.length > 0
                    ? {
                        components: [
                          {
                            type: 'body',
                            parameters: templateParams.map((val: string) => ({ type: 'text', text: val })),
                          },
                        ],
                      }
                    : {}),
                },
              }
            : {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneDigits,
                type: 'text',
                text: { preview_url: true, body: messageText },
              };

          const metaRes = await fetch(metaUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${channelSettings.whatsappCloudApiKey.trim()}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(messageBody),
          });

          const metaData = await metaRes.json();
          const msgStatus = metaData.messages?.[0]?.message_status;

          if (metaRes.ok && metaData.messages?.[0]?.id && msgStatus === 'held_for_quality_assessment') {
            // API accepted the request but Meta is holding it — it will NOT reach the phone.
            // Common for brand-new test numbers/business accounts that haven't built a quality rating yet.
            delivered = false;
            errorDetail =
              'Meta accepted the request but is holding this message for quality assessment — it will not be delivered. This is common for brand-new test numbers/business accounts with no quality rating yet. Check Meta Business Suite → WhatsApp Manager → Phone Numbers for the quality status; it typically resolves after Meta reviews initial sends.';
            providerResponse = metaData;
            console.warn(`[Meta Cloud API] HELD (quality assessment) for ${lead?.phone} — ${JSON.stringify(metaData)}`);
          } else if (metaRes.ok && metaData.messages?.[0]?.id) {
            delivered = true;
            providerResponse = { provider: 'meta_cloud_api', messageId: metaData.messages[0].id, contacts: metaData.contacts };
            console.log(`[Meta Cloud API] Accepted for ${lead?.phone} — id: ${metaData.messages[0].id} — resolved wa_id: ${metaData.contacts?.[0]?.wa_id}`);
            // Fire-and-forget: let the AI booking bot know this lead once they reply.
            if (orgId) {
              seedConversationFromLead(orgId, lead || {}, campaignRecipientId).catch(() => {});
            }
          } else {
            const baseError = metaData.error?.message || 'Meta Cloud API error';
            errorDetail =
              metaData.error?.code === 132000
                ? `${baseError} — the number of Body Variables configured in Settings doesn't match the {{n}} placeholders in your approved template. Check the exact count and try again.`
                : baseError;
            providerResponse = metaData;
            console.warn(`[Meta Cloud API] FAILED to ${lead?.phone} — ${JSON.stringify(metaData)}`);
          }
        } catch (err: any) {
          errorDetail = err.message || 'Failed connecting to Meta Cloud API';
        }
      }
    }
    // 3. Custom Webhook as primary delivery (e.g. n8n workflow that owns the actual WhatsApp send via 360dialog, Gupshup, etc.)
    else if (provider === 'webhook' && (webhookUrl || channelSettings?.n8nWebhookUrl)) {
      try {
        const targetUrl = webhookUrl || channelSettings?.n8nWebhookUrl;
        const hookRes = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'whatsapp_outreach_dispatch',
            timestamp: new Date().toISOString(),
            lead,
            messageText,
            directUrl,
          }),
        });
        delivered = hookRes.ok;
        providerResponse = { provider: 'webhook', status: hookRes.status };
        if (!hookRes.ok) {
          errorDetail = `Webhook returned HTTP ${hookRes.status}`;
        }
      } catch (err: any) {
        errorDetail = err.message || 'Webhook trigger failed';
      }
    }
    // 4. Unconfigured provider (missing required credentials)
    else if (provider === 'twilio' || provider === 'cloud_api' || provider === 'webhook') {
      errorDetail =
        provider === 'twilio'
          ? 'Twilio Account SID and Auth Token are required. Please configure them in Settings.'
          : provider === 'cloud_api'
            ? 'WhatsApp Cloud API access token and Phone Number ID are required. Please configure them in Settings.'
            : 'A webhook URL is required. Set it under n8n / Webhook in Settings.';
    } else {
      // Default Web / Direct mode
      delivered = true;
    }

    // 5. Optional n8n / Custom Webhook notification (skip if the webhook was already the primary delivery above)
    if (provider !== 'webhook') {
      const activeWebhook = webhookUrl || channelSettings?.n8nWebhookUrl;
      if (activeWebhook) {
        try {
          const payload = {
            event: 'whatsapp_outreach_dispatch',
            timestamp: new Date().toISOString(),
            provider,
            lead,
            messageText,
            directUrl,
            delivered,
          };
          await fetch(activeWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        } catch (e) {
          console.warn('External webhook notification failed:', e);
        }
      }
    }

    const logEntry: OutreachDispatchLog = {
      id: `wa-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      leadId: lead?.id || 'lead',
      leadName: lead?.name || 'Contact',
      recipient: lead?.phone || '',
      channel: 'whatsapp',
      status: delivered ? 'delivered' : 'failed',
      timestamp: new Date().toISOString(),
      preview: (messageText || '').substring(0, 90) + '...',
      directUrl,
    };

    dispatchLogs.unshift(logEntry);
    if (dispatchLogs.length > 100) dispatchLogs.pop();

    res.json({
      success: true,
      delivered,
      provider,
      providerResponse,
      errorDetail,
      directUrl,
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

    let delivered = false;
    let providerResponse: any = null;
    let errorDetail: string | null = null;

    const provider = channelSettings?.emailProvider || 'mailto_direct';
    const fromName = senderName || 'OmniReach AI';
    const fromAddress = senderEmail || 'onboarding@resend.dev';

    // 1. Resend API
    if (provider === 'resend' && channelSettings?.emailApiKey) {
      try {
        let resendFrom = `${fromName} <onboarding@resend.dev>`;
        if (channelSettings?.resendFromEmail && !channelSettings.resendFromEmail.includes('.example') && channelSettings.resendFromEmail.includes('@')) {
          resendFrom = `${fromName} <${channelSettings.resendFromEmail.trim()}>`;
        } else if (fromAddress && !fromAddress.includes('.example') && fromAddress.includes('@')) {
          resendFrom = `${fromName} <${fromAddress.trim()}>`;
        }

        let resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${channelSettings.emailApiKey.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: resendFrom,
            to: [lead?.email],
            subject: subject || 'Meeting Request',
            text: body || '',
            html: (body || '').replace(/\n/g, '<br/>'),
            ...(replyTo ? { reply_to: replyTo } : {}),
          }),
        });

        let resendText = await resendRes.text();
        let resendData: any = {};
        try {
          resendData = JSON.parse(resendText);
        } catch {
          resendData = { message: resendText };
        }

        // Automatic fallback: If custom domain is unverified, retry with onboarding@resend.dev
        if (!resendRes.ok && (resendData.message?.toLowerCase().includes('domain') || resendData.message?.toLowerCase().includes('verify') || resendData.name === 'validation_error')) {
          if (!resendFrom.includes('onboarding@resend.dev')) {
            const fallbackRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${channelSettings.emailApiKey.trim()}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: `${fromName} <onboarding@resend.dev>`,
                to: [lead?.email],
                subject: subject || 'Meeting Request',
                text: body || '',
                html: (body || '').replace(/\n/g, '<br/>'),
                ...(replyTo ? { reply_to: replyTo } : {}),
              }),
            });
            const fallbackText = await fallbackRes.text();
            try {
              resendData = JSON.parse(fallbackText);
            } catch {
              resendData = { message: fallbackText };
            }
            resendRes = fallbackRes;
          }
        }

        if (resendRes.ok && resendData.id) {
          delivered = true;
          providerResponse = { provider: 'resend', id: resendData.id };
          console.log(`[Resend] Delivered to ${lead?.email} (from: ${resendFrom}) — id: ${resendData.id}`);
        } else {
          errorDetail = resendData.message || resendData.error || 'Resend API returned an error';
          providerResponse = resendData;
          console.warn(`[Resend] FAILED to ${lead?.email} (from: ${resendFrom}) — status: ${resendRes.status} — ${JSON.stringify(resendData)}`);
        }
      } catch (err: any) {
        errorDetail = err.message || 'Failed connecting to Resend';
      }
    }
    // 2. SendGrid API
    else if (provider === 'sendgrid' && channelSettings?.emailApiKey) {
      try {
        const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${channelSettings.emailApiKey.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: lead?.email, name: lead?.name }] }],
            from: { email: fromAddress, name: fromName },
            subject: subject || 'Meeting Request',
            content: [{ type: 'text/plain', value: body || '' }],
            ...(replyTo ? { reply_to: { email: replyTo } } : {}),
          }),
        });

        const sgText = await sgRes.text();
        let sgData: any = {};
        try {
          sgData = JSON.parse(sgText);
        } catch {
          sgData = { message: sgText };
        }

        if (sgRes.status === 202 || sgRes.ok) {
          delivered = true;
          providerResponse = { provider: 'sendgrid', status: 'queued_accepted' };
        } else {
          errorDetail = sgData.errors?.[0]?.message || sgData.message || 'SendGrid API returned an error';
          providerResponse = sgData;
        }
      } catch (err: any) {
        errorDetail = err.message || 'Failed connecting to SendGrid';
      }
    }
    // 3. Generic SMTP (Gmail App Password, Zoho Mail, Outlook/Office 365, cPanel, custom business email)
    else if (provider === 'smtp' && channelSettings?.smtpHost && channelSettings?.smtpUser && channelSettings?.smtpPass) {
      try {
        const port = Number(channelSettings.smtpPort) || 587;
        const transporter = nodemailer.createTransport({
          host: channelSettings.smtpHost.trim(),
          port,
          secure: channelSettings.smtpSecure ?? port === 465,
          auth: {
            user: channelSettings.smtpUser.trim(),
            pass: channelSettings.smtpPass,
          },
        });

        const smtpFrom = (channelSettings.smtpFromEmail || channelSettings.smtpUser).trim();
        const info = await transporter.sendMail({
          from: `${fromName} <${smtpFrom}>`,
          to: lead?.email,
          subject: subject || 'Meeting Request',
          text: body || '',
          html: (body || '').replace(/\n/g, '<br/>'),
          ...(replyTo ? { replyTo } : {}),
        });

        delivered = true;
        providerResponse = { provider: 'smtp', messageId: info.messageId };
        console.log(`[SMTP] Delivered to ${lead?.email} via ${channelSettings.smtpHost} — id: ${info.messageId}`);
      } catch (err: any) {
        errorDetail = err.message || 'Failed to send via SMTP';
        console.warn(`[SMTP] FAILED to ${lead?.email} via ${channelSettings.smtpHost} — ${errorDetail}`);
      }
    }
    // 4. Mailgun API
    else if (provider === 'mailgun' && channelSettings?.emailApiKey && channelSettings?.mailgunDomain) {
      try {
        const domain = channelSettings.mailgunDomain.trim();
        const apiHost = channelSettings.mailgunRegion === 'eu' ? 'api.eu.mailgun.net' : 'api.mailgun.net';
        const mgFrom = fromAddress && !fromAddress.includes('.example') ? fromAddress : `postmaster@${domain}`;

        const form = new URLSearchParams();
        form.append('from', `${fromName} <${mgFrom}>`);
        form.append('to', lead?.email || '');
        form.append('subject', subject || 'Meeting Request');
        form.append('text', body || '');
        form.append('html', (body || '').replace(/\n/g, '<br/>'));
        if (replyTo) form.append('h:Reply-To', replyTo);

        const mgRes = await fetch(`https://${apiHost}/v3/${domain}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`api:${channelSettings.emailApiKey.trim()}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        });

        const mgText = await mgRes.text();
        let mgData: any = {};
        try {
          mgData = JSON.parse(mgText);
        } catch {
          mgData = { message: mgText };
        }

        if (mgRes.ok && mgData.id) {
          delivered = true;
          providerResponse = { provider: 'mailgun', id: mgData.id };
          console.log(`[Mailgun] Delivered to ${lead?.email} via ${domain} — id: ${mgData.id}`);
        } else {
          errorDetail = mgData.message || 'Mailgun API returned an error';
          providerResponse = mgData;
          console.warn(`[Mailgun] FAILED to ${lead?.email} via ${domain} — status: ${mgRes.status} — ${JSON.stringify(mgData)}`);
        }
      } catch (err: any) {
        errorDetail = err.message || 'Failed connecting to Mailgun';
      }
    }
    // 5. Unconfigured provider (missing required credentials)
    else if (provider === 'smtp' || provider === 'mailgun' || provider === 'resend' || provider === 'sendgrid') {
      errorDetail =
        provider === 'smtp'
          ? 'SMTP host, username, and password are required. Please configure them in Settings.'
          : provider === 'mailgun'
            ? 'Mailgun API key and domain are required. Please configure them in Settings.'
            : 'API key is missing. Please enter your API key in Settings.';
    } else {
      // Default direct mailto mode
      delivered = true;
    }

    // Fire-and-forget: let the AI booking bot know this lead once they reply.
    if (delivered && orgId && replyTo) {
      seedEmailConversationFromLead(orgId, lead || {}, campaignRecipientId, subject).catch(() => {});
    }

    // 3. Optional n8n / Custom Webhook Trigger
    const activeWebhook = webhookUrl || channelSettings?.n8nWebhookUrl;
    if (activeWebhook) {
      try {
        const payload = {
          event: 'email_outreach_dispatch',
          timestamp: new Date().toISOString(),
          provider,
          lead,
          subject,
          body,
          mailtoUrl,
          delivered,
        };
        await fetch(activeWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        console.warn('External email webhook notification failed:', e);
      }
    }

    const logEntry: OutreachDispatchLog = {
      id: `em-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      leadId: lead?.id || 'lead',
      leadName: lead?.name || 'Contact',
      recipient: lead?.email || '',
      channel: 'email',
      status: delivered ? 'delivered' : 'failed',
      timestamp: new Date().toISOString(),
      subject,
      preview: (body || '').substring(0, 90) + '...',
      directUrl: mailtoUrl,
    };

    dispatchLogs.unshift(logEntry);
    if (dispatchLogs.length > 100) dispatchLogs.pop();

    res.json({
      success: true,
      delivered,
      provider,
      providerResponse,
      errorDetail,
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

// Email Webhook Receiver — SendGrid Inbound Parse posts replies here as multipart/form-data.
// Configure the Destination URL in SendGrid as: https://<domain>/api/email/inbound?token=<EMAIL_INBOUND_WEBHOOK_SECRET>
app.post('/api/email/inbound', async (req, res) => {
  if (!verifyEmailWebhookToken(req.query.token as string | undefined)) {
    return res.sendStatus(403);
  }
  res.sendStatus(200); // ack immediately; SendGrid retries on slow/non-2xx responses
  try {
    const fields = await parseMultipartFields(req);
    await processInboundEmail(fields);
  } catch (err) {
    console.error('[Email Webhook] Processing error:', err);
  }
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
