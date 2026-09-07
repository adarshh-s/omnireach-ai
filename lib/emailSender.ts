import nodemailer from 'nodemailer';
import type { ChannelApiSettings } from '../src/types';

export interface SendEmailResult {
  ok: boolean;
  error?: string;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  fromName: string;
  replyTo?: string;
}

/**
 * Sends one email using an org's own configured provider — used by the AI booking bot's
 * replies. Mirrors the provider branching in the outbound send-email routes, kept as a
 * separate lean implementation (same precedent as lib/whatsappSender.ts vs. the full
 * send-whatsapp route) since the bot's needs are simpler (no template mode, no dispatch log).
 */
export async function sendEmailViaOrgProvider(
  settings: ChannelApiSettings | null | undefined,
  params: SendEmailParams
): Promise<SendEmailResult> {
  const provider = settings?.emailProvider || 'mailto_direct';
  const { to, subject, body, fromName, replyTo } = params;
  const html = body.replace(/\n/g, '<br/>');

  if (provider === 'resend' && settings?.emailApiKey) {
    try {
      const fromAddress =
        settings.smtpFromEmail && !settings.smtpFromEmail.includes('.example') && settings.smtpFromEmail.includes('@')
          ? settings.smtpFromEmail.trim()
          : 'onboarding@resend.dev';
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${settings.emailApiKey.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${fromName} <${fromAddress}>`,
          to: [to],
          subject,
          text: body,
          html,
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.id) return { ok: true };
      return { ok: false, error: data.message || 'Resend API error' };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Failed connecting to Resend' };
    }
  }

  if (provider === 'sendgrid' && settings?.emailApiKey) {
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${settings.emailApiKey.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: settings.smtpFromEmail || 'no-reply@example.com', name: fromName },
          subject,
          content: [{ type: 'text/plain', value: body }],
          ...(replyTo ? { reply_to: { email: replyTo } } : {}),
        }),
      });
      if (res.status === 202 || res.ok) return { ok: true };
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.errors?.[0]?.message || 'SendGrid API error' };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Failed connecting to SendGrid' };
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
      await transporter.sendMail({
        from: `${fromName} <${fromAddress}>`,
        to,
        subject,
        text: body,
        html,
        ...(replyTo ? { replyTo } : {}),
      });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Failed to send via SMTP' };
    }
  }

  if (provider === 'mailgun' && settings?.emailApiKey && settings?.mailgunDomain) {
    try {
      const domain = settings.mailgunDomain.trim();
      const apiHost = settings.mailgunRegion === 'eu' ? 'api.eu.mailgun.net' : 'api.mailgun.net';
      const fromAddress = settings.smtpFromEmail && !settings.smtpFromEmail.includes('.example') ? settings.smtpFromEmail : `postmaster@${domain}`;
      const form = new URLSearchParams();
      form.append('from', `${fromName} <${fromAddress}>`);
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
      if (res.ok) return { ok: true };
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.message || 'Mailgun API error' };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Failed connecting to Mailgun' };
    }
  }

  return { ok: false, error: 'No email provider configured for this organization.' };
}
