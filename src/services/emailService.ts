// Direct client/edge email sender compatible with Vercel and static hosting
import { ChannelApiSettings, Lead } from '../types';

export interface SendEmailPayload {
  lead: Partial<Lead> & { email: string; name?: string };
  subject: string;
  body: string;
  channelSettings: ChannelApiSettings;
  senderName?: string;
  senderEmail?: string;
}

export interface SendEmailResult {
  success: boolean;
  delivered: boolean;
  provider: string;
  providerResponse?: any;
  errorDetail?: string;
}

export async function sendEmailDirectOrBackend(payload: SendEmailPayload): Promise<SendEmailResult> {
  const { lead, subject, body, channelSettings, senderName = 'OmniReach AI', senderEmail } = payload;
  const provider = channelSettings?.emailProvider || 'mailto_direct';
  const apiKey = (channelSettings?.emailApiKey || '').trim();

  // 1. Call the backend / Vercel serverless API endpoint
  try {
    const res = await fetch('/api/outreach/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const raw = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(raw);
    } catch {
      data = { errorDetail: raw.substring(0, 120) };
    }

    if (res.ok && data) {
      return {
        success: data.success ?? true,
        delivered: !!data.delivered,
        provider: data.provider || provider,
        providerResponse: data.providerResponse,
        errorDetail: data.errorDetail,
      };
    } else if (data && data.errorDetail) {
      return {
        success: false,
        delivered: false,
        provider: data.provider || provider,
        errorDetail: data.errorDetail,
        providerResponse: data.providerResponse,
      };
    }
  } catch (err: any) {
    console.warn('Backend route /api/outreach/send-email encountered error:', err);
  }

  // 2. Fallback Webhook / n8n trigger
  if (provider === 'webhook' && channelSettings?.n8nWebhookUrl) {
    try {
      const hookRes = await fetch(channelSettings.n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return {
        success: true,
        delivered: hookRes.ok,
        provider: 'webhook',
      };
    } catch (err: any) {
      return {
        success: false,
        delivered: false,
        provider: 'webhook',
        errorDetail: err.message,
      };
    }
  }

  // 3. Fallback mailto trigger
  return {
    success: true,
    delivered: false,
    provider: 'mailto_direct',
    errorDetail: apiKey ? 'API call failed to connect. Ensure your API key is valid.' : 'No API key provided. Please configure in Settings.',
  };
}
