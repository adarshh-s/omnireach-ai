import nodemailer from 'nodemailer';
import type { ChannelApiSettings } from '../src/types.js';

export interface SendEmailResult {
  ok: boolean;
  error?: string;
  provider: string;
  providerResponse?: unknown;
}

export interface SendEmailParams {
  to: string;
  toName?: string;
  subject: string;
  body: string;
  fromName: string;
  /** Preferred from-address for resend/sendgrid/mailgun (falls back to settings.smtpFromEmail, then a safe default). Ignored for smtp, which always uses settings.smtpFromEmail. */
  fromAddress?: string;
  replyTo?: string;
  /** Only used when settings.emailProvider === 'webhook'. */
  webhookUrl?: string;
  webhookContext?: unknown;
}

function isUsableAddress(addr: string | undefined | null): addr is string {
  return Boolean(addr && addr.includes('@') && !addr.includes('.example'));
}

/**
 * Sends one email using an org's own configured provider (Resend / SendGrid / SMTP /
 * Mailgun / webhook). Shared by the AI booking bot's replies, the interactive campaign
 * send route (api/outreach/send-email.ts, server.ts), and the headless scheduled
 * dispatcher (api/cron/dispatch-scheduled.ts) — all three need identical send behavior.
 */
export async function sendEmailViaOrgProvider(
  settings: ChannelApiSettings | null | undefined,
  params: SendEmailParams
): Promise<SendEmailResult> {
  const provider = settings?.emailProvider || 'mailto_direct';
  const { to, toName, subject, body, fromName, replyTo, webhookUrl, webhookContext } = params;
  const html = body.replace(/\n/g, '<br/>');

  const preferredFrom = isUsableAddress(params.fromAddress)
    ? params.fromAddress
    : isUsableAddress(settings?.smtpFromEmail)
      ? settings!.smtpFromEmail!.trim()
      : undefined;

  if (provider === 'resend' && settings?.emailApiKey) {
    const apiKey = settings.emailApiKey.trim();
    const sendResend = async (fromAddr: string) => {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${fromName} <${fromAddr}>`,
          to: [to],
          subject,
          text: body,
          html,
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
      return { res, data };
    };

    try {
      const firstFrom = preferredFrom || 'onboarding@resend.dev';
      let { res, data } = await sendResend(firstFrom);

      // Automatic fallback: if a custom domain is unverified, retry with onboarding@resend.dev
      const looksLikeDomainError =
        !res.ok && (data.message?.toLowerCase().includes('domain') || data.message?.toLowerCase().includes('verify') || data.name === 'validation_error');
      if (looksLikeDomainError && firstFrom !== 'onboarding@resend.dev') {
        ({ res, data } = await sendResend('onboarding@resend.dev'));
      }

      if (res.ok && (data.id || res.status === 200 || res.status === 201)) {
        return { ok: true, provider, providerResponse: { id: data.id } };
      }
      return { ok: false, provider, error: data.message || data.error || 'Resend API error', providerResponse: data };
    } catch (err: any) {
      return { ok: false, provider, error: err.message || 'Failed connecting to Resend' };
    }
  }

  if (provider === 'sendgrid' && settings?.emailApiKey) {
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${settings.emailApiKey.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to, name: toName }] }],
          from: { email: preferredFrom || 'no-reply@example.com', name: fromName },
          subject,
          content: [{ type: 'text/plain', value: body }],
          ...(replyTo ? { reply_to: { email: replyTo } } : {}),
        }),
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
      if (res.status === 202 || res.ok) return { ok: true, provider, providerResponse: { status: 'queued_accepted' } };
      return { ok: false, provider, error: data.errors?.[0]?.message || data.message || 'SendGrid API error', providerResponse: data };
    } catch (err: any) {
      return { ok: false, provider, error: err.message || 'Failed connecting to SendGrid' };
    }
  }

  if (provider === 'smtp' && settings?.smtpHost && settings?.smtpUser && settings?.smtpPass) {
    try {
      const port = Number(settings.smtpPort) || 587;
      const transporter = nodemailer.createTransport({
        host: settings.smtpHost.trim(),
        port,
        secure: settings.smtpSecure ?? port === 465,
        auth: { user: settings.smtpUser.trim(), pass: settings.smtpPass },
      });
      const fromAddress = (settings.smtpFromEmail || settings.smtpUser).trim();
      const info = await transporter.sendMail({
        from: `${fromName} <${fromAddress}>`,
        to,
        subject,
        text: body,
        html,
        ...(replyTo ? { replyTo } : {}),
      });
      return { ok: true, provider, providerResponse: { messageId: info.messageId } };
    } catch (err: any) {
      return { ok: false, provider, error: err.message || 'Failed to send via SMTP' };
    }
  }

  if (provider === 'mailgun' && settings?.emailApiKey && settings?.mailgunDomain) {
    try {
      const domain = settings.mailgunDomain.trim();
      const apiHost = settings.mailgunRegion === 'eu' ? 'api.eu.mailgun.net' : 'api.mailgun.net';
      const fromAddr = preferredFrom || `postmaster@${domain}`;
      const form = new URLSearchParams();
      form.append('from', `${fromName} <${fromAddr}>`);
      form.append('to', to);
      form.append('subject', subject);
      form.append('text', body);
      form.append('html', html);
      if (replyTo) form.append('h:Reply-To', replyTo);

      const res = await fetch(`https://${apiHost}/v3/${domain}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${settings.emailApiKey.trim()}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
      if (res.ok && data.id) return { ok: true, provider, providerResponse: { id: data.id } };
      return { ok: false, provider, error: data.message || 'Mailgun API error', providerResponse: data };
    } catch (err: any) {
      return { ok: false, provider, error: err.message || 'Failed connecting to Mailgun' };
    }
  }

  if (provider === 'webhook' && (webhookUrl || settings?.n8nWebhookUrl)) {
    try {
      const targetUrl = webhookUrl || settings?.n8nWebhookUrl!;
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'email_outreach_dispatch',
          timestamp: new Date().toISOString(),
          lead: webhookContext,
          subject,
          body,
        }),
      });
      if (res.ok) return { ok: true, provider, providerResponse: { status: res.status } };
      return { ok: false, provider, error: `Webhook returned HTTP ${res.status}`, providerResponse: { status: res.status } };
    } catch (err: any) {
      return { ok: false, provider, error: err.message || 'Webhook trigger failed' };
    }
  }

  if (provider === 'smtp') {
    return { ok: false, provider, error: 'SMTP host, username, and password are required. Please configure them in Settings.' };
  }
  if (provider === 'mailgun') {
    return { ok: false, provider, error: 'Mailgun API key and domain are required. Please configure them in Settings.' };
  }
  if (provider === 'resend' || provider === 'sendgrid') {
    return { ok: false, provider, error: 'API key is missing. Please enter your API key in Settings.' };
  }
  if (provider === 'webhook') {
    return { ok: false, provider, error: 'A webhook URL is required. Set it under n8n / Webhook in Settings.' };
  }
  // mailto_direct (default): actual delivery happens client-side via a mailto: link for
  // interactive sends — this isn't a failure, so no error message (matches prior route behavior).
  // For headless callers (AI bot replies, scheduled dispatch) this correctly surfaces as ok:false.
  return { ok: false, provider };
}
