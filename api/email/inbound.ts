import type { IncomingMessage } from 'http';
import { parseMultipartFields } from '../../lib/parseMultipart';
import { verifyEmailWebhookToken, processInboundEmail } from '../../lib/emailWebhookHandler';

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (data: unknown) => void;
}

/**
 * SendGrid Inbound Parse webhook target. Configure the Destination URL in SendGrid as:
 *   https://<your-domain>/api/email/inbound?token=<EMAIL_INBOUND_WEBHOOK_SECRET>
 * SendGrid always POSTs multipart/form-data (never JSON) — hence the manual parser
 * instead of relying on any framework's default JSON body parsing.
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
    const fields = await parseMultipartFields(req);
    await processInboundEmail(fields);
  } catch (err) {
    console.error('[Email Webhook] Processing error:', err);
  }
}
