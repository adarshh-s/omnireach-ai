import { getSupabaseAdmin } from './supabaseAdmin';
import {
  getContextFromCampaignRecipientId,
  getContextFromClientId,
  getOrgProfile,
  getOrgChannelSettings,
  getOrgGoogleCalendarToken,
  markClientOptedOut,
} from './orgSettings';
import { sendEmailViaOrgProvider } from './emailSender';
import { runConversationTurn, ConversationTurn } from './conversationEngine';
import { createMeetingEvent } from './googleCalendar';
import { getGeminiClient } from './geminiClient';
import { OPT_OUT_PATTERN, OPT_OUT_REPLY } from './compliance';

/** Verifies the shared secret appended to the Inbound Parse Destination URL, so this
 * endpoint can't be spammed by anyone who finds the URL. */
export function verifyEmailWebhookToken(token: string | undefined): boolean {
  const expected = process.env.EMAIL_INBOUND_WEBHOOK_SECRET;
  return !!expected && token === expected;
}

function trackingAddressFor(type: 'cr' | 'client', id: string): string {
  const domain = process.env.EMAIL_INBOUND_DOMAIN || '';
  return `reply+${type}_${id}@${domain}`;
}

function extractTrackingToken(toHeader: string): { type: 'cr' | 'client'; id: string } | null {
  const match = toHeader.match(/reply\+(cr|client)_([a-zA-Z0-9-]+)@/);
  if (!match) return null;
  return { type: match[1] as 'cr' | 'client', id: match[2] };
}

function extractEmailAddress(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  return (match ? match[1] : fromHeader).trim().toLowerCase();
}

/**
 * Processes one inbound email delivered by SendGrid's Inbound Parse webhook. Identifies
 * the org/client via a Reply-To tracking address embedded in every outbound campaign
 * email (see seedEmailConversationFromLead / the send-email routes' replyTo handling),
 * runs the same AI scheduling conversation used for WhatsApp, books a real Google
 * Calendar meeting if confirmed, and sends the reply back via the org's own provider.
 */
export async function processInboundEmail(fields: Record<string, string>): Promise<void> {
  const toHeader = fields.to || '';
  const fromHeader = fields.from || '';
  const subject = fields.subject || '';
  const bodyText = (fields.text || '').trim();

  if (!bodyText) return; // nothing to react to

  const token = extractTrackingToken(toHeader);
  if (!token) {
    console.warn('[Email Bot] No tracking token found in To header — dropping:', toHeader);
    return;
  }

  const context =
    token.type === 'cr' ? await getContextFromCampaignRecipientId(token.id) : await getContextFromClientId(token.id);
  if (!context) {
    console.warn('[Email Bot] Could not resolve org/client for token', token);
    return;
  }

  const { orgId, clientId } = context;
  const fromEmail = extractEmailAddress(fromHeader);
  const trackingAddress = trackingAddressFor(token.type, token.id);

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.warn('[Email Bot] Supabase is not configured — cannot persist conversation state or reply.');
    return;
  }

  const { data: existing } = await supabase
    .from('email_conversations')
    .select('*')
    .eq('org_id', orgId)
    .eq('client_email', fromEmail)
    .maybeSingle();

  const history: ConversationTurn[] = existing?.history || [];
  const nowIso = new Date().toISOString();
  history.push({ role: 'user', text: bodyText, timestamp: nowIso });

  const [orgProfile, orgChannelSettings, calendarToken] = await Promise.all([
    getOrgProfile(orgId),
    getOrgChannelSettings(orgId),
    getOrgGoogleCalendarToken(orgId),
  ]);
  const fromName = orgProfile?.senderName || orgProfile?.companyName || 'Team';

  if (OPT_OUT_PATTERN.test(bodyText)) {
    history.push({ role: 'assistant', text: OPT_OUT_REPLY, timestamp: new Date().toISOString() });
    if (clientId) await markClientOptedOut(orgId, clientId);

    await supabase.from('email_conversations').upsert(
      {
        org_id: orgId,
        client_email: fromEmail,
        client_id: clientId,
        campaign_recipient_id: token.type === 'cr' ? token.id : existing?.campaign_recipient_id,
        lead_name: existing?.lead_name || context.clientName,
        lead_company: existing?.lead_company || context.clientCompany,
        status: 'declined',
        subject: existing?.subject || subject,
        history,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,client_email' }
    );

    await sendEmailViaOrgProvider(orgChannelSettings, {
      to: fromEmail,
      subject: subject ? `Re: ${subject}` : 'Unsubscribed',
      body: OPT_OUT_REPLY,
      fromName,
      replyTo: trackingAddress,
    });
    return;
  }

  const ai = getGeminiClient();
  const result = ai
    ? await runConversationTurn({
        aiClient: ai,
        channel: 'email',
        inboundSubject: subject,
        leadName: existing?.lead_name || context.clientName,
        leadCompany: existing?.lead_company || context.clientCompany,
        companyName: orgProfile?.companyName,
        senderName: orgProfile?.senderName,
        serviceDescription: orgProfile?.serviceDescription,
        history,
        nowIso,
      })
    : {
        reply: "Thanks for your email! We'll get back to you shortly.",
        replySubject: subject ? `Re: ${subject}` : 'Re: your inquiry',
        status: 'active' as const,
        meeting: null,
      };

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
          summary: `Discovery Call with ${existing?.lead_name || context.clientName || fromEmail}`,
          description: `Booked automatically via OmniReach AI Email bot.\n\nConversation:\n${history
            .map((h) => `${h.role}: ${h.text}`)
            .join('\n')}`,
          startIso,
          durationMinutes: result.meeting.durationMinutes,
          attendeeEmail: fromEmail,
          attendeeName: existing?.lead_name || context.clientName || undefined,
        });
        if (event) {
          meetingDateTimeIso = startIso;
          meetLink = event.meetLink || null;
          calendarEventId = event.eventId || null;
        } else {
          finalStatus = 'active';
        }
      } catch (err) {
        console.error('[Email Bot] Google Calendar booking failed:', err);
        finalStatus = 'active';
        replyText = `${replyText}\n\n(I had trouble locking that into the calendar — mind confirming the date and time once more?)`;
      }
    } else {
      meetingDateTimeIso = new Date(`${result.meeting.date}T${result.meeting.time}:00`).toISOString();
    }
  }

  if (meetLink) {
    replyText = `${replyText}\n\nMeeting confirmed! Google Meet link: ${meetLink}`;
  }

  history.push({ role: 'assistant', text: replyText, timestamp: new Date().toISOString() });

  await supabase.from('email_conversations').upsert(
    {
      org_id: orgId,
      client_email: fromEmail,
      client_id: clientId,
      campaign_recipient_id: token.type === 'cr' ? token.id : existing?.campaign_recipient_id,
      lead_name: existing?.lead_name || context.clientName,
      lead_company: existing?.lead_company || context.clientCompany,
      status: finalStatus,
      subject: existing?.subject || subject,
      history,
      meeting_date: meetingDateTimeIso ? meetingDateTimeIso.slice(0, 10) : existing?.meeting_date,
      meeting_time: meetingDateTimeIso ? result.meeting?.time : existing?.meeting_time,
      meeting_datetime_iso: meetingDateTimeIso || existing?.meeting_datetime_iso,
      meet_link: meetLink || existing?.meet_link,
      calendar_event_id: calendarEventId || existing?.calendar_event_id,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,client_email' }
  );

  const sendResult = await sendEmailViaOrgProvider(orgChannelSettings, {
    to: fromEmail,
    subject: result.replySubject || (subject ? `Re: ${subject}` : 'Re: your inquiry'),
    body: replyText,
    fromName,
    replyTo: trackingAddress,
  });
  if (!sendResult.ok) {
    console.error('[Email Bot] Failed to send auto-reply:', sendResult.error);
  }
}

/**
 * Seeds a conversation row with the lead's identity when an outbound campaign email
 * goes out, so an inbound reply is matched deterministically from the first message.
 */
export async function seedEmailConversationFromLead(
  orgId: string,
  lead: { id?: string; name?: string; company?: string; email?: string },
  campaignRecipientId?: string | null,
  subject?: string
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const email = (lead?.email || '').trim().toLowerCase();
  if (!email) return;

  try {
    await supabase.from('email_conversations').upsert(
      {
        org_id: orgId,
        client_email: email,
        client_id: lead.id,
        campaign_recipient_id: campaignRecipientId || null,
        lead_name: lead.name,
        lead_company: lead.company,
        subject: subject || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,client_email' }
    );
  } catch (err) {
    console.warn('[Email Bot] Failed to seed conversation from lead:', err);
  }
}

/** Builds the Reply-To tracking address to attach to an outbound campaign email. */
export function buildEmailReplyToAddress(campaignRecipientId: string | null | undefined): string | null {
  const domain = process.env.EMAIL_INBOUND_DOMAIN;
  if (!domain || !campaignRecipientId) return null;
  return trackingAddressFor('cr', campaignRecipientId);
}
