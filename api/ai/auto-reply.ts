import { GoogleGenAI } from '@google/genai';

interface ApiRequest {
  method?: string;
  body?: any;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (data: unknown) => void;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { incomingMessage, lead, settings, availableSlots } = req.body || {};

    const clientName = lead?.name || 'there';
    const firstName = clientName.split(' ')[0];
    const companyName = settings?.companyName || 'our company';
    const nextSlot = (availableSlots || []).find((s: { available: boolean }) => s.available) || availableSlots?.[0];
    const bookingLink = nextSlot
      ? `https://calendar.google.com/booking?date=${nextSlot.date}&slot=${encodeURIComponent(nextSlot.time)}`
      : 'https://meet.google.com/demo-slot';

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && incomingMessage) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const prompt = `A client named ${clientName} at company ${lead?.company || 'their firm'} replied to our outreach with:
"${incomingMessage}"

Our company: ${companyName}
Our value prop: ${settings?.serviceDescription || 'AI outreach and calendar booking automation'}
Booking Link: ${bookingLink}

Generate a concise, helpful, polite, and persuasive response (under 75 words).
- If they are interested or asking for times: provide the booking link ${bookingLink}.
- If they ask about pricing or features: answer positively with general context and invite them to the 10-minute demo via ${bookingLink}.
- If they say not interested or unsubscribe: acknowledge politely and confirm they are opted out.

Return strict JSON:
{
  "reply": "The response message text"
}`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });

        try {
          const parsed = JSON.parse(response.text || '{}');
          if (parsed.reply) {
            return res.status(200).json({ reply: parsed.reply });
          }
        } catch {}
      } catch (geminiError) {
        console.warn('Gemini auto-reply fallback:', geminiError);
      }
    }

    const lower = (incomingMessage || '').toLowerCase();
    if (lower.includes('price') || lower.includes('cost')) {
      return res.status(200).json({
        reply: `Our pricing scales flexibly with your contact volume. We'd love to show you a quick breakdown for ${lead?.company || 'your team'} on a 10-minute call: ${bookingLink}`,
      });
    }

    if (lower.includes('yes') || lower.includes('sure') || lower.includes('demo') || lower.includes('link')) {
      return res.status(200).json({
        reply: `Awesome, ${firstName}! You can choose any open time that fits your calendar here: ${bookingLink}. Looking forward to connecting!`,
      });
    }

    return res.status(200).json({
      reply: `Thanks for the response, ${firstName}! Would Thursday at 11:00 AM or Friday at 3:00 PM work for a quick walk-through? Or pick any time here: ${bookingLink}`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to generate auto-reply' });
  }
}
