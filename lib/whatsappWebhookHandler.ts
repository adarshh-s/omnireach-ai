import { getSupabaseAdmin } from './supabaseAdmin.js';
import {
  getOrgIdByPhoneNumberId,
  getOrgProfile,
  getOrgChannelSettings,
  getOrgGoogleCalendarToken,
  markClientOptedOut,
} from './orgSettings.js';
import { sendWhatsAppText } from './whatsappSender.js';
import { runConversationTurn, ConversationTurn } from './conversationEngine.js';
import { createMeetingEvent } from './googleCalendar.js';
import { getGeminiClient } from './geminiClient.js';
import { OPT_OUT_PATTERN, OPT_OUT_REPLY } from './compliance.js';

export function verifyWhatsAppWebhook(query: Record<string, unknown>): { challenge: string } | null {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return { challenge: String(challenge ?? '') };
  }
  return null;
}

/**
 * Processes one incoming Meta WhatsApp Cloud API webhook delivery. A single webhook URL
 * serves every org — the org is resolved from `value.metadata.phone_number_id` (each org
 * connects their own Meta phone number in Settings). Runs the AI scheduling conversation,
 * books a real Google Calendar meeting on that org's calendar if a time was confirmed,
 * persists the conversation to Supabase scoped to that org, and sends the reply back.
 */
export async function processWhatsAppWebhookPayload(body: any): Promise<void> {
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message || message.type !== 'text') {
    console.log('[WhatsApp Bot] Ignoring non-text/empty payload:', JSON.stringify(body)?.slice(0, 500));
    return; // ignore status callbacks, media, reactions, etc.
  }
  console.log('[WhatsApp Bot] Processing text message from', message.from, '- phoneNumberId:', value?.metadata?.phone_number_id);

  const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;
  const fromPhone: string = message.from;
  const incomingText: string = message.text?.body || '';
  const contactName: string | undefined = value?.contacts?.[0]?.profile?.name;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.warn('[WhatsApp Bot] Supabase is not configured — cannot persist conversation state or reply.');
    return;
  }

  if (!phoneNumberId) {
    console.warn('[WhatsApp Bot] Webhook payload had no phone_number_id — cannot resolve which org this belongs to.');
    return;
  }

  const orgId = await getOrgIdByPhoneNumberId(phoneNumberId);
  if (!orgId) {
    console.warn(`[WhatsApp Bot] No org has WhatsApp phone_number_id ${phoneNumberId} configured — dropping message.`);
    return;
  }

  const [orgProfile, orgChannelSettings, calendarToken] = await Promise.all([
    getOrgProfile(orgId),
    getOrgChannelSettings(orgId),
    getOrgGoogleCalendarToken(orgId),
  ]);

  const { data: existing } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('org_id', orgId)
    .eq('phone', fromPhone)
    .maybeSingle();

  // Meta guarantees at-least-once webhook delivery and retries if our response is slow —
  // without this, a retry racing the original in-flight request can overwrite newer
  // conversation state (e.g. a just-confirmed meeting) with a stale reply.
  const inboundMessageId: string | undefined = message.id;
  if (inboundMessageId && existing?.last_inbound_message_id === inboundMessageId) {
    console.log('[WhatsApp Bot] Duplicate delivery of message', inboundMessageId, '— skipping.');
    return;
  }

  const history: ConversationTurn[] = existing?.history || [];
  const nowIso = new Date().toISOString();
  history.push({ role: 'user', text: incomingText, timestamp: nowIso });

  if (OPT_OUT_PATTERN.test(incomingText.trim())) {
    history.push({ role: 'assistant', text: OPT_OUT_REPLY, timestamp: new Date().toISOString() });

    // Mark the client opted-out — prefer the id already linked to this conversation
    // (set whenever a campaign contacted them); fall back to matching by phone.
    if (existing?.client_id) {
      await markClientOptedOut(orgId, existing.client_id);
    } else {
      await supabase
        .from('clients')
        .update({ opted_out: true, updated_at: new Date().toISOString() })
        .eq('org_id', orgId)
        .in('phone', [fromPhone, `+${fromPhone}`]);
    }

    await supabase.from('whatsapp_conversations').upsert(
      {
        org_id: orgId,
        phone: fromPhone,
        lead_id: existing?.lead_id,
        client_id: existing?.client_id,
        campaign_recipient_id: existing?.campaign_recipient_id,
        lead_name: existing?.lead_name || contactName,
        lead_email: existing?.lead_email,
        lead_company: existing?.lead_company,
        status: 'declined',
        history,
        last_inbound_message_id: inboundMessageId || existing?.last_inbound_message_id,
        collected: existing?.collected || {},
        meeting_date: existing?.meeting_date,
        meeting_time: existing?.meeting_time,
        meeting_datetime_iso: existing?.meeting_datetime_iso,
        meet_link: existing?.meet_link,
        calendar_event_id: existing?.calendar_event_id,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,phone' }
    );

    await sendWhatsAppText(orgChannelSettings?.whatsappCloudApiKey, orgChannelSettings?.whatsappCloudPhoneId, fromPhone, OPT_OUT_REPLY);
    return;
  }

  const ai = getGeminiClient();
  const result = ai
    ? await runConversationTurn({
        aiClient: ai,
        leadName: existing?.lead_name || contactName,
        leadCompany: existing?.lead_company,
        companyName: orgProfile?.companyName,
        senderName: orgProfile?.senderName,
        serviceDescription: orgProfile?.serviceDescription,
        history,
        nowIso,
      })
    : { reply: "Thanks for your message! We'll get back to you shortly.", status: 'active' as const, meeting: null };

  let finalStatus = result.status;
  let meetingDateTimeIso: string | null = null;
  let meetLink: string | null = null;
  let calendarEventId: string | null = null;
  let replyText = result.reply;

  if (result.status === 'confirmed' && result.meeting) {
    if (calendarToken) {
      try {
        const startIso = new Date(`${result.meeting.date}T${result.meeting.time}:00`).toISOString();
        const event = await createMeetingEvent({
          refreshToken: calendarToken.refreshToken,
          calendarId: calendarToken.calendarId,
          summary: `Discovery Call with ${existing?.lead_name || contactName || fromPhone}`,
          description: `Booked automatically via OmniReach AI WhatsApp bot.\n\nConversation:\n${history
            .map((h) => `${h.role}: ${h.text}`)
            .join('\n')}`,
          startIso,
          durationMinutes: result.meeting.durationMinutes,
          attendeeEmail: existing?.lead_email || undefined,
          attendeeName: existing?.lead_name || contactName || undefined,
        });
        if (event) {
          meetingDateTimeIso = startIso;
          meetLink = event.meetLink || null;
          calendarEventId = event.eventId || null;
        } else {
          finalStatus = 'active';
        }
      } catch (err) {
        console.error('[WhatsApp Bot] Google Calendar booking failed:', err);
        finalStatus = 'active';
        replyText = `${replyText}\n\n(I had trouble locking that into the calendar — mind confirming the date and time once more?)`;
      }
    } else {
      // No calendar connected for this org yet — still record the requested time, just no real event.
      meetingDateTimeIso = new Date(`${result.meeting.date}T${result.meeting.time}:00`).toISOString();
    }
  }

  if (meetLink) {
    replyText = `${replyText}\n\n📅 Meeting confirmed! Google Meet link: ${meetLink}`;
  }

  history.push({ role: 'assistant', text: replyText, timestamp: new Date().toISOString() });

  await supabase.from('whatsapp_conversations').upsert(
    {
      org_id: orgId,
      phone: fromPhone,
      lead_id: existing?.lead_id,
      lead_name: existing?.lead_name || contactName,
      lead_email: existing?.lead_email,
      lead_company: existing?.lead_company,
      status: finalStatus,
      history,
      last_inbound_message_id: inboundMessageId || existing?.last_inbound_message_id,
      collected: existing?.collected || {},
      meeting_date: meetingDateTimeIso ? meetingDateTimeIso.slice(0, 10) : existing?.meeting_date,
      meeting_time: meetingDateTimeIso ? result.meeting?.time : existing?.meeting_time,
      meeting_datetime_iso: meetingDateTimeIso || existing?.meeting_datetime_iso,
      meet_link: meetLink || existing?.meet_link,
      calendar_event_id: calendarEventId || existing?.calendar_event_id,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,phone' }
  );

  const sendResult = await sendWhatsAppText(
    orgChannelSettings?.whatsappCloudApiKey,
    orgChannelSettings?.whatsappCloudPhoneId,
    fromPhone,
    replyText
  );
  if (!sendResult.ok) {
    console.error('[WhatsApp Bot] Failed to send auto-reply:', sendResult.error);
  }
}

/**
 * Seeds a conversation row with the lead's identity when an outbound campaign message
 * goes out, so when they reply, the bot already knows who it's talking to.
 */
export async function seedConversationFromLead(
  orgId: string,
  lead: { id?: string; name?: string; company?: string; email?: string; phone?: string },
  campaignRecipientId?: string | null
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const phoneDigits = (lead?.phone || '').replace(/\D/g, '');
  if (!phoneDigits) return;

  try {
    await supabase.from('whatsapp_conversations').upsert(
      {
        org_id: orgId,
        phone: phoneDigits,
        lead_id: lead.id,
        client_id: lead.id,
        campaign_recipient_id: campaignRecipientId || null,
        lead_name: lead.name,
        lead_email: lead.email,
        lead_company: lead.company,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,phone' }
    );
  } catch (err) {
    console.warn('[WhatsApp Bot] Failed to seed conversation from lead:', err);
  }
}
