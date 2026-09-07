import { GoogleGenAI } from '@google/genai';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export interface ConversationResult {
  reply: string;
  replySubject?: string;
  status: 'active' | 'confirmed' | 'declined' | 'handoff';
  meeting: { date: string; time: string; durationMinutes: number } | null;
}

export interface RunConversationTurnParams {
  aiClient: GoogleGenAI;
  channel?: 'whatsapp' | 'email';
  inboundSubject?: string;
  leadName?: string;
  leadCompany?: string;
  companyName?: string;
  senderName?: string;
  serviceDescription?: string;
  history: ConversationTurn[];
  nowIso: string;
}

const VALID_STATUSES: ConversationResult['status'][] = ['active', 'confirmed', 'declined', 'handoff'];

export async function runConversationTurn(params: RunConversationTurnParams): Promise<ConversationResult> {
  const {
    aiClient,
    channel = 'whatsapp',
    inboundSubject,
    leadName,
    leadCompany,
    companyName,
    senderName,
    serviceDescription,
    history,
    nowIso,
  } = params;

  const now = new Date(nowIso);
  const todayLabel = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const todayDateStr = now.toISOString().slice(0, 10);
  const isEmail = channel === 'email';

  const transcript = history
    .slice(-16)
    .map((h) => `${h.role === 'user' ? 'Prospect' : 'Assistant'}: ${h.text}`)
    .join('\n');

  const prompt = `You are a friendly, professional ${isEmail ? 'email' : 'WhatsApp'} scheduling assistant for ${companyName || 'our company'}${
    senderName ? `, writing on behalf of ${senderName}` : ''
  }. You're ${isEmail ? 'emailing' : 'chatting with'} a prospect${leadName ? ` named ${leadName}` : ''}${leadCompany ? ` from ${leadCompany}` : ''}.

Today is ${todayLabel} (ISO: ${now.toISOString()}).
${isEmail && inboundSubject ? `Email subject: "${inboundSubject}"` : ''}

Your ONLY goal: determine if they want a short intro call, and if so, agree on ONE specific date and time for it (resolve relative terms like "tomorrow" or "Thursday" against today's date), then clearly restate the confirmed date and time back to them. ${
    isEmail
      ? 'Keep the email reply concise (under 120 words), professional but warm, with a greeting and sign-off. No corporate jargon.'
      : 'Keep replies under 50 words, warm and natural, no corporate jargon.'
  } Never invent facts you weren't given.
${serviceDescription ? `What we offer: ${serviceDescription}` : ''}

Conversation so far:
${transcript}

Reply to the prospect's latest message. Output STRICT JSON only, no markdown, no commentary:
{
  "reply": "your ${isEmail ? 'email body' : 'WhatsApp reply'} text"${isEmail ? ',\n  "replySubject": "a short reply subject line, e.g. \\"Re: quick intro call\\""' : ''},
  "status": "active" | "confirmed" | "declined" | "handoff",
  "meeting": { "date": "YYYY-MM-DD", "time": "HH:MM", "durationMinutes": 30 } or null
}

Rules:
- "confirmed": ONLY when the prospect has explicitly agreed to one specific date AND time, and your reply restates it clearly.
- "declined": they're not interested or asked to stop contacting them.
- "handoff": they're asking something you can't answer confidently (exact pricing, technical detail, contract terms) or explicitly ask for a human — reply that a team member will follow up shortly.
- "active": still gathering info or proposing time options.
- When proposing times, always offer 1-2 concrete options (e.g. "would tomorrow 3 PM or Thursday 11 AM work?") instead of an open-ended "when works for you?".
- "meeting.date" must be ${todayDateStr} or a later date. "meeting.time" must be 24-hour HH:MM.`;

  const response = await aiClient.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: prompt,
    config: { responseMimeType: 'application/json' },
  });

  try {
    const parsed = JSON.parse(response.text || '{}');
    const status: ConversationResult['status'] = VALID_STATUSES.includes(parsed.status) ? parsed.status : 'active';

    let meeting: ConversationResult['meeting'] = null;
    if (status === 'confirmed' && parsed.meeting?.date && parsed.meeting?.time) {
      const candidate = new Date(`${parsed.meeting.date}T${parsed.meeting.time}:00`);
      const isValidFutureDate = !isNaN(candidate.getTime()) && candidate.getTime() > now.getTime() - 5 * 60000;
      if (isValidFutureDate) {
        meeting = {
          date: parsed.meeting.date,
          time: parsed.meeting.time,
          durationMinutes: Number(parsed.meeting.durationMinutes) > 0 ? Number(parsed.meeting.durationMinutes) : 30,
        };
      }
    }

    return {
      reply: parsed.reply || "Thanks for your message! Could you tell me a bit more?",
      replySubject: isEmail ? parsed.replySubject || (inboundSubject ? `Re: ${inboundSubject}` : 'Re: your inquiry') : undefined,
      status: meeting || status !== 'confirmed' ? status : 'active',
      meeting,
    };
  } catch {
    return {
      reply: isEmail ? 'Sorry, could you clarify that? Want to make sure I get the details right.' : 'Sorry, could you say that again? Want to make sure I get the details right.',
      replySubject: isEmail ? (inboundSubject ? `Re: ${inboundSubject}` : 'Re: your inquiry') : undefined,
      status: 'active',
      meeting: null,
    };
  }
}
