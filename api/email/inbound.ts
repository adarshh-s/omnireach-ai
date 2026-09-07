import type { IncomingMessage } from 'http';
import { parseInboundEmailFields } from '../../lib/parseMultipart.js';
import { verifyEmailWebhookToken, processInboundEmail } from '../../lib/emailWebhookHandler.js';

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (data: unknown) => void;
}

/**
 * Inbound email webhook target — accepts either SendGrid's Inbound Parse (multipart/form-data)
 * or our own Cloudflare Email Worker (application/json), see lib/parseMultipart.ts and
 * cloudflare/email-worker.js. Whichever provider is used, configure it to POST to:
 *   https://<your-domain>/api/email/inbound?token=<EMAIL_INBOUND_WEBHOOK_SECRET>
 */
export default async function handler(req: IncomingMessage & { method?: string; query?: Record<string, unknown> }, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = new URL(req.url || '', 'http://localhost');
  const token = url.searchParams.get('token') || undefined;
  if (!verifyEmailWebhookToken(token)) {
    return res.status(403).json({ error: 'Invalid webhook token' });
  }

  // Ack immediately — SendGrid retries on slow/non-2xx responses.
  res.status(200).json({ received: true });

  try {
    const fields = await parseInboundEmailFields(req);
    await processInboundEmail(fields);
  } catch (err) {
    console.error('[Email Webhook] Processing error:', err);
  }
}
