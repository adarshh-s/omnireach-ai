import { verifyWhatsAppWebhook, processWhatsAppWebhookPayload } from '../../lib/whatsappWebhookHandler.js';

interface ApiRequest {
  method?: string;
  query?: Record<string, unknown>;
  body?: unknown;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  send: (data: unknown) => void;
  json: (data: unknown) => void;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'GET') {
    const result = verifyWhatsAppWebhook((req.query || {}) as Record<string, unknown>);
    if (result) {
      return res.status(200).send(result.challenge);
    }
    return res.status(403).send('Forbidden');
  }

  if (req.method === 'POST') {
    // Ack immediately — Meta requires a fast response and will retry/disable the
    // webhook if it doesn't get one within a few seconds.
    res.status(200).json({ received: true });
    try {
      await processWhatsAppWebhookPayload(req.body);
    } catch (err) {
      console.error('[WhatsApp Webhook] Processing error:', err);
    }
    return;
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
