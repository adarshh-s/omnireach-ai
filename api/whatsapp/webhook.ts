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
    // Must await fully before responding — Vercel's Node runtime does not reliably keep
    // a serverless function alive for work started after the response is sent (unlike a
    // long-running Express process), so an "ack now, process after" pattern here silently
    // drops the processing mid-flight. Meta's webhook timeout is generous enough (~20s)
    // to tolerate the extra latency from the AI call + WhatsApp send happening first.
    try {
      await processWhatsAppWebhookPayload(req.body);
    } catch (err) {
      console.error('[WhatsApp Webhook] Processing error:', err);
    }
    return res.status(200).json({ received: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
