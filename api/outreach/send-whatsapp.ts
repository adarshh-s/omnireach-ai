interface ApiRequest {
  method?: string;
  body?: any;
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
    const { lead, messageText, channelSettings, webhookUrl, templateParams } = req.body || {};
    const phoneDigits = (lead?.phone || '').replace(/[^0-9]/g, '');
    const encodedText = encodeURIComponent(messageText || '');
    const directUrl = `https://wa.me/${phoneDigits}?text=${encodedText}`;

    let delivered = false;
    let providerResponse: any = null;
    let errorDetail: string | null = null;

    const provider = channelSettings?.whatsAppProvider || 'web_direct';
    const useTemplate = channelSettings?.whatsappMessageMode === 'template';

    // 1. Twilio WhatsApp
    if (provider === 'twilio' && channelSettings?.twilioAccountSid && channelSettings?.twilioAuthToken) {
      if (useTemplate && !channelSettings.twilioContentSid) {
        errorDetail = 'Template mode is on but no Twilio Content SID is configured. Please add one in Settings.';
      } else {
        try {
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${channelSettings.twilioAccountSid}/Messages.json`;
          const fromNumber = channelSettings.twilioFromNumber || '+14155238886';
          const formattedFrom = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;
          const formattedTo = `whatsapp:+${phoneDigits}`;

          const formData = new URLSearchParams();
          formData.append('From', formattedFrom);
          formData.append('To', formattedTo);

          if (useTemplate) {
            formData.append('ContentSid', channelSettings.twilioContentSid.trim());
            if (Array.isArray(templateParams) && templateParams.length > 0) {
              const contentVariables: Record<string, string> = {};
              templateParams.forEach((val: string, idx: number) => {
                contentVariables[String(idx + 1)] = val;
              });
              formData.append('ContentVariables', JSON.stringify(contentVariables));
            }
          } else {
            formData.append('Body', messageText || '');
          }

          const authHeader = `Basic ${Buffer.from(`${channelSettings.twilioAccountSid}:${channelSettings.twilioAuthToken}`).toString('base64')}`;

          const twilioRes = await fetch(twilioUrl, {
            method: 'POST',
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString(),
          });

          const twilioData = await twilioRes.json();
          if (twilioRes.ok) {
            delivered = true;
            providerResponse = { provider: 'twilio', sid: twilioData.sid, status: twilioData.status };
          } else {
            errorDetail = twilioData.message || 'Twilio API returned an error';
            providerResponse = twilioData;
          }
        } catch (err: any) {
          errorDetail = err.message || 'Failed connecting to Twilio';
        }
      }
    }
    // 2. Meta WhatsApp Cloud API
    else if (provider === 'cloud_api' && channelSettings?.whatsappCloudApiKey && channelSettings?.whatsappCloudPhoneId) {
      if (useTemplate && !channelSettings.whatsappTemplateName) {
        errorDetail = 'Template mode is on but no approved template name is configured. Please add one in Settings.';
      } else {
      try {
        const phoneId = channelSettings.whatsappCloudPhoneId.trim();
        const metaUrl = `https://graph.facebook.com/v25.0/${phoneId}/messages`;

        const messageBody = useTemplate
          ? {
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: phoneDigits,
              type: 'template',
              template: {
                name: channelSettings.whatsappTemplateName.trim(),
                language: { code: channelSettings.whatsappTemplateLanguage || 'en_US' },
                ...(Array.isArray(templateParams) && templateParams.length > 0
                  ? {
                      components: [
                        {
                          type: 'body',
                          parameters: templateParams.map((val: string) => ({ type: 'text', text: val })),
                        },
                      ],
                    }
                  : {}),
              },
            }
          : {
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: phoneDigits,
              type: 'text',
              text: { preview_url: true, body: messageText },
            };

        const metaRes = await fetch(metaUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${channelSettings.whatsappCloudApiKey.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(messageBody),
        });

        const metaData = await metaRes.json();
        const msgStatus = metaData.messages?.[0]?.message_status;

        if (metaRes.ok && metaData.messages?.[0]?.id && msgStatus === 'held_for_quality_assessment') {
          delivered = false;
          errorDetail =
            'Meta accepted the request but is holding this message for quality assessment — it will not be delivered. This is common for brand-new test numbers/business accounts with no quality rating yet. Check Meta Business Suite → WhatsApp Manager → Phone Numbers for the quality status.';
          providerResponse = metaData;
        } else if (metaRes.ok && metaData.messages?.[0]?.id) {
          delivered = true;
          providerResponse = { provider: 'meta_cloud_api', messageId: metaData.messages[0].id, contacts: metaData.contacts };
        } else {
          const baseError = metaData.error?.message || 'Meta Cloud API error';
          errorDetail =
            metaData.error?.code === 132000
              ? `${baseError} — the number of Body Variables configured in Settings doesn't match the {{n}} placeholders in your approved template. Check the exact count and try again.`
              : baseError;
          providerResponse = metaData;
        }
      } catch (err: any) {
        errorDetail = err.message || 'Failed connecting to Meta Cloud API';
      }
      }
    }
    // 3. Custom Webhook as primary delivery (e.g. n8n workflow that owns the actual WhatsApp send via 360dialog, Gupshup, etc.)
    else if (provider === 'webhook' && (webhookUrl || channelSettings?.n8nWebhookUrl)) {
      try {
        const targetUrl = webhookUrl || channelSettings?.n8nWebhookUrl;
        const hookRes = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'whatsapp_outreach_dispatch',
            timestamp: new Date().toISOString(),
            lead,
            messageText,
            directUrl,
          }),
        });
        delivered = hookRes.ok;
        providerResponse = { provider: 'webhook', status: hookRes.status };
        if (!hookRes.ok) {
          errorDetail = `Webhook returned HTTP ${hookRes.status}`;
        }
      } catch (err: any) {
        errorDetail = err.message || 'Webhook trigger failed';
      }
    }
    // 4. Unconfigured provider (missing required credentials)
    else if (provider === 'twilio' || provider === 'cloud_api' || provider === 'webhook') {
      errorDetail =
        provider === 'twilio'
          ? 'Twilio Account SID and Auth Token are required. Please configure them in Settings.'
          : provider === 'cloud_api'
            ? 'WhatsApp Cloud API access token and Phone Number ID are required. Please configure them in Settings.'
            : 'A webhook URL is required. Set it under n8n / Webhook in Settings.';
    } else {
      delivered = true;
    }

    // 5. Optional n8n / Custom Webhook notification (skip if the webhook was already the primary delivery above)
    if (provider !== 'webhook') {
      const activeWebhook = webhookUrl || channelSettings?.n8nWebhookUrl;
      if (activeWebhook) {
        try {
          const payload = {
            event: 'whatsapp_outreach_dispatch',
            timestamp: new Date().toISOString(),
            provider,
            lead,
            messageText,
            directUrl,
            delivered,
          };
          await fetch(activeWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        } catch (e) {
          console.warn('External webhook notification failed:', e);
        }
      }
    }

    const logEntry = {
      id: `wa-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      leadId: lead?.id || 'lead',
      leadName: lead?.name || 'Contact',
      recipient: lead?.phone || '',
      channel: 'whatsapp',
      status: delivered ? 'delivered' : 'failed',
      timestamp: new Date().toISOString(),
      preview: (messageText || '').substring(0, 90) + '...',
      directUrl,
    };

    return res.status(200).json({
      success: true,
      delivered,
      provider,
      providerResponse,
      errorDetail,
      directUrl,
      log: logEntry,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || 'Failed to dispatch WhatsApp message',
    });
  }
}
