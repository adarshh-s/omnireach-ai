import { seedConversationFromLead } from '../../lib/whatsappWebhookHandler.js';
import { getOrgIdFromAuthHeader } from '../../lib/supabaseServerAuth.js';
import { sendCampaignWhatsAppMessage } from '../../lib/whatsappCampaignSender.js';

interface ApiRequest {
  method?: string;
  body?: any;
  headers?: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (data: unknown) => void;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { lead, messageText, channelSettings, webhookUrl, templateParams, campaignRecipientId } = req.body || {};
    const orgId = await getOrgIdFromAuthHeader(req.headers?.authorization as string | undefined);

    const result = await sendCampaignWhatsAppMessage(channelSettings, {
      toPhone: lead?.phone || '',
      messageText,
      templateParams,
      webhookUrl,
      webhookContext: lead,
    });

    // Fire-and-forget: let the AI booking bot know this lead once they reply (Meta Cloud
    // API only — the inbound webhook the bot listens on is Meta-specific).
    if (result.provider === 'cloud_api' && result.delivered && orgId) {
      seedConversationFromLead(orgId, lead || {}, campaignRecipientId).catch(() => {});
    }

    const logEntry = {
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

    return res.status(200).json({
      success: true,
      delivered: result.delivered,
      provider: result.provider,
      providerResponse: result.providerResponse,
      errorDetail: result.errorDetail,
      directUrl: result.directUrl,
      log: logEntry,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || 'Failed to dispatch WhatsApp message',
    });
  }
}
