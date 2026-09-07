export interface SendWhatsAppTextResult {
  ok: boolean;
  error?: string;
  messageId?: string;
}

/**
 * Sends a free-form WhatsApp text reply via Meta Cloud API, using one org's own
 * credentials. Only valid within the 24h customer-service window opened by the
 * prospect's own inbound message — which is always the case here, since this is
 * only ever called in direct response to one.
 */
export async function sendWhatsAppText(
  apiKey: string | undefined,
  phoneId: string | undefined,
  toPhoneDigits: string,
  text: string
): Promise<SendWhatsAppTextResult> {
  if (!apiKey || !phoneId) {
    return {
      ok: false,
      error: 'WhatsApp Cloud API is not configured for this organization yet — connect it in the Settings dashboard.',
    };
  }

  try {
    const url = `https://graph.facebook.com/v25.0/${phoneId.trim()}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhoneDigits,
        type: 'text',
        text: { preview_url: true, body: text },
      }),
    });

    const data = await res.json();
    if (res.ok && data.messages?.[0]?.id) {
      return { ok: true, messageId: data.messages[0].id };
    }
    return { ok: false, error: data.error?.message || 'Meta Cloud API error' };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Failed connecting to Meta Cloud API' };
  }
}
