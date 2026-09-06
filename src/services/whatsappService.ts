// Direct client/edge WhatsApp sender compatible with Vercel and static hosting
import { ChannelApiSettings, Lead } from '../types';

export interface SendWhatsAppPayload {
  lead: Partial<Lead> & { phone: string; name?: string };
  messageText: string;
  channelSettings: ChannelApiSettings;
  webhookUrl?: string;
  templateParams?: string[];
}

export interface SendWhatsAppResult {
  success: boolean;
  delivered: boolean;
  provider: string;
  providerResponse?: any;
  errorDetail?: string;
  directUrl?: string;
}

export async function sendWhatsAppDirectOrBackend(payload: SendWhatsAppPayload): Promise<SendWhatsAppResult> {
  const provider = payload.channelSettings?.whatsAppProvider || 'web_direct';

  try {
    const res = await fetch('/api/outreach/send-whatsapp', {
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
        directUrl: data.directUrl,
      };
    }
    return {
      success: false,
      delivered: false,
      provider: data.provider || provider,
      errorDetail: data.errorDetail || 'Failed to dispatch WhatsApp message',
      providerResponse: data.providerResponse,
    };
  } catch (err: any) {
    return {
      success: false,
      delivered: false,
      provider,
      errorDetail: err.message || 'Connection failed',
    };
  }
}
