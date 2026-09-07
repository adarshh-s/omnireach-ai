import nodemailer from 'nodemailer';
import { getOrgIdFromAuthHeader } from '../../lib/supabaseServerAuth.js';
import { buildEmailReplyToAddress, seedEmailConversationFromLead } from '../../lib/emailWebhookHandler.js';

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
    const { lead, subject, body, channelSettings, webhookUrl, senderName, senderEmail, campaignRecipientId } = req.body || {};
    const orgId = await getOrgIdFromAuthHeader(req.headers?.authorization as string | undefined);
    const replyTo = buildEmailReplyToAddress(campaignRecipientId) || undefined;

    const mailtoUrl = `mailto:${lead?.email || ''}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body || '')}`;

    let delivered = false;
    let providerResponse: any = null;
    let errorDetail: string | null = null;

    const provider = channelSettings?.emailProvider || 'mailto_direct';
    const apiKey = (channelSettings?.emailApiKey || process.env.RESEND_API_KEY || '').trim();
    const fromName = senderName || 'OmniReach AI';
    const fromAddress = senderEmail || 'onboarding@resend.dev';

    // 1. Resend API
    if (provider === 'resend' && apiKey) {
      try {
        let resendFrom = `${fromName} <onboarding@resend.dev>`;
        if (channelSettings?.resendFromEmail && !channelSettings.resendFromEmail.includes('.example') && channelSettings.resendFromEmail.includes('@')) {
          resendFrom = `${fromName} <${channelSettings.resendFromEmail.trim()}>`;
        } else if (fromAddress && !fromAddress.includes('.example') && fromAddress.includes('@')) {
          resendFrom = `${fromName} <${fromAddress.trim()}>`;
        }

        let resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: resendFrom,
            to: [lead?.email],
            subject: subject || 'Meeting Request',
            text: body || '',
            html: (body || '').replace(/\n/g, '<br/>'),
            ...(replyTo ? { reply_to: replyTo } : {}),
          }),
        });

        let resendText = await resendRes.text();
        let resendData: any = {};
        try {
          resendData = JSON.parse(resendText);
        } catch {
          resendData = { message: resendText };
        }

        // Automatic fallback: If custom domain is unverified, retry with onboarding@resend.dev
        if (!resendRes.ok && (resendData.message?.toLowerCase().includes('domain') || resendData.message?.toLowerCase().includes('verify') || resendData.name === 'validation_error')) {
          if (!resendFrom.includes('onboarding@resend.dev')) {
            const fallbackRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: `${fromName} <onboarding@resend.dev>`,
                to: [lead?.email],
                subject: subject || 'Meeting Request',
                text: body || '',
                html: (body || '').replace(/\n/g, '<br/>'),
                ...(replyTo ? { reply_to: replyTo } : {}),
              }),
            });
            const fallbackText = await fallbackRes.text();
            try {
              resendData = JSON.parse(fallbackText);
            } catch {
              resendData = { message: fallbackText };
            }
            resendRes = fallbackRes;
          }
        }

        if (resendRes.ok && (resendData.id || resendRes.status === 200 || resendRes.status === 201)) {
          delivered = true;
          providerResponse = { provider: 'resend', id: resendData.id };
        } else {
          errorDetail = resendData.message || resendData.error || 'Resend API error';
          providerResponse = resendData;
        }
      } catch (err: any) {
        errorDetail = err.message || 'Failed connecting to Resend';
      }
    }
    // 2. SendGrid API
    else if (provider === 'sendgrid' && apiKey) {
      try {
        const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: lead?.email, name: lead?.name }] }],
            from: { email: fromAddress, name: fromName },
            subject: subject || 'Meeting Request',
            content: [{ type: 'text/plain', value: body || '' }],
            ...(replyTo ? { reply_to: { email: replyTo } } : {}),
          }),
        });

        const sgText = await sgRes.text();
        let sgData: any = {};
        try {
          sgData = JSON.parse(sgText);
        } catch {
          sgData = { message: sgText };
        }

        if (sgRes.status === 202 || sgRes.ok) {
          delivered = true;
          providerResponse = { provider: 'sendgrid', status: 'queued_accepted' };
        } else {
          errorDetail = sgData.errors?.[0]?.message || sgData.message || 'SendGrid API error';
          providerResponse = sgData;
        }
      } catch (err: any) {
        errorDetail = err.message || 'Failed connecting to SendGrid';
      }
    }
    // 3. Generic SMTP (Gmail App Password, Zoho Mail, Outlook/Office 365, cPanel, custom business email)
    else if (provider === 'smtp' && channelSettings?.smtpHost && channelSettings?.smtpUser && channelSettings?.smtpPass) {
      try {
        const port = Number(channelSettings.smtpPort) || 587;
        const transporter = nodemailer.createTransport({
          host: channelSettings.smtpHost.trim(),
          port,
          secure: channelSettings.smtpSecure ?? port === 465,
          auth: {
            user: channelSettings.smtpUser.trim(),
            pass: channelSettings.smtpPass,
          },
        });

        const smtpFrom = (channelSettings.smtpFromEmail || channelSettings.smtpUser).trim();
        const info = await transporter.sendMail({
          from: `${fromName} <${smtpFrom}>`,
          to: lead?.email,
          subject: subject || 'Meeting Request',
          text: body || '',
          html: (body || '').replace(/\n/g, '<br/>'),
          ...(replyTo ? { replyTo } : {}),
        });

        delivered = true;
        providerResponse = { provider: 'smtp', messageId: info.messageId };
      } catch (err: any) {
        errorDetail = err.message || 'Failed to send via SMTP';
      }
    }
    // 4. Mailgun API
    else if (provider === 'mailgun' && channelSettings?.emailApiKey && channelSettings?.mailgunDomain) {
      try {
        const domain = channelSettings.mailgunDomain.trim();
        const apiHost = channelSettings.mailgunRegion === 'eu' ? 'api.eu.mailgun.net' : 'api.mailgun.net';
        const mgFrom = fromAddress && !fromAddress.includes('.example') ? fromAddress : `postmaster@${domain}`;

        const form = new URLSearchParams();
        form.append('from', `${fromName} <${mgFrom}>`);
        form.append('to', lead?.email || '');
        form.append('subject', subject || 'Meeting Request');
        form.append('text', body || '');
        form.append('html', (body || '').replace(/\n/g, '<br/>'));
        if (replyTo) form.append('h:Reply-To', replyTo);

        const mgRes = await fetch(`https://${apiHost}/v3/${domain}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`api:${channelSettings.emailApiKey.trim()}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        });

        const mgText = await mgRes.text();
        let mgData: any = {};
        try {
          mgData = JSON.parse(mgText);
        } catch {
          mgData = { message: mgText };
        }

        if (mgRes.ok && mgData.id) {
          delivered = true;
          providerResponse = { provider: 'mailgun', id: mgData.id };
        } else {
          errorDetail = mgData.message || 'Mailgun API returned an error';
          providerResponse = mgData;
        }
      } catch (err: any) {
        errorDetail = err.message || 'Failed connecting to Mailgun';
      }
    }
    // 5. Webhook Trigger
    else if (provider === 'webhook' && (webhookUrl || channelSettings?.n8nWebhookUrl)) {
      try {
        const targetUrl = webhookUrl || channelSettings?.n8nWebhookUrl;
        const hookRes = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'email_outreach_dispatch',
            timestamp: new Date().toISOString(),
            lead,
            subject,
            body,
          }),
        });
        delivered = hookRes.ok;
        providerResponse = { status: hookRes.status };
      } catch (err: any) {
        errorDetail = err.message || 'Webhook trigger failed';
      }
    } else {
      delivered = false;
      if (provider === 'smtp') {
        errorDetail = 'SMTP host, username, and password are required. Please configure them in Settings.';
      } else if (provider === 'mailgun') {
        errorDetail = 'Mailgun API key and domain are required. Please configure them in Settings.';
      } else if (provider === 'resend' || provider === 'sendgrid') {
        errorDetail = 'API key is missing. Please enter your API key in Settings.';
      }
    }

    // Fire-and-forget: let the AI booking bot know this lead once they reply.
    if (delivered && orgId && replyTo) {
      seedEmailConversationFromLead(orgId, lead || {}, campaignRecipientId, subject).catch(() => {});
    }

    const logEntry = {
      id: `em-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      leadId: lead?.id || 'lead',
      leadName: lead?.name || 'Contact',
      recipient: lead?.email || '',
      channel: 'email',
      status: delivered ? 'delivered' : 'failed',
      timestamp: new Date().toISOString(),
      subject: subject || 'Outreach',
      preview: (body || '').substring(0, 90) + '...',
      directUrl: mailtoUrl,
    };

    return res.status(200).json({
      success: true,
      delivered,
      provider,
      providerResponse,
      errorDetail,
      mailtoUrl,
      log: logEntry,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      delivered: false,
      error: error.message || 'Failed to dispatch email',
      errorDetail: error.message,
    });
  }
}
