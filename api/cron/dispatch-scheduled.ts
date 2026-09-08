import { getSupabaseAdmin } from '../../lib/supabaseAdmin.js';
import { getOrgChannelSettings } from '../../lib/orgSettings.js';
import { sendCampaignWhatsAppMessage } from '../../lib/whatsappCampaignSender.js';
import { sendEmailViaOrgProvider } from '../../lib/emailSender.js';
import { seedConversationFromLead } from '../../lib/whatsappWebhookHandler.js';
import { seedEmailConversationFromLead, buildEmailReplyToAddress } from '../../lib/emailWebhookHandler.js';
import type { ChannelApiSettings } from '../../src/types.js';

interface ApiRequest {
  method?: string;
  query?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (data: unknown) => void;
}

const BATCH_SIZE = 25;

/**
 * Accepts either Vercel's own automatic `Authorization: Bearer $CRON_SECRET` header
 * (added to every cron invocation when an env var literally named CRON_SECRET is set)
 * or a `?token=` query param — so a free external pinger (e.g. cron-job.org) can also
 * trigger this for real intra-day scheduling precision beyond Vercel Hobby's 1x/day cap.
 */
function verifyDispatchToken(req: ApiRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const authHeader = (req.headers?.authorization as string | undefined) || '';
  if (authHeader === `Bearer ${expected}`) return true;
  return (req.query?.token as string | undefined) === expected;
}

interface DuePayload {
  whatsappMessage?: string;
  templateParams?: string[];
  emailSubject?: string;
  emailBody?: string;
  senderName?: string;
  senderEmail?: string;
}

/**
 * Headless dispatcher for country-peak-time-scheduled campaign sends — picks up
 * campaign_recipients rows whose scheduled_for has arrived, using the pre-generated
 * message content (payload) written at campaign-launch time, since there's no browser/AI
 * context available here. Triggered by vercel.json's daily cron entry and/or an external
 * pinger hitting this URL every few minutes.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!verifyDispatchToken(req)) {
    return res.status(403).json({ error: 'Invalid dispatch token' });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(200).json({ processed: 0, note: 'Supabase not configured' });
  }

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
  const settingsCache = new Map<string, ChannelApiSettings | null>();

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
    const payload: DuePayload = row.payload || {};

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

  return res.status(200).json({ processed: (due || []).length, sent, failed, skipped });
}
