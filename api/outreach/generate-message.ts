import { GoogleGenAI } from '@google/genai';

interface ApiRequest {
  method?: string;
  body?: any;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (data: unknown) => void;
  setHeader?: (name: string, value: string) => void;
}

function interpolate(templateText: string, vars: Record<string, string>): string {
  if (!templateText) return '';
  let result = templateText;
  for (const [key, value] of Object.entries(vars)) {
    const reg = new RegExp(`{{${key}}}`, 'gi');
    result = result.replace(reg, value || '');
  }
  return result;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { lead, settings, template, availableSlots } = req.body || {};

    const clientCompany = lead?.company || 'their organization';
    const clientName = lead?.name || 'there';
    const firstName = clientName.split(' ')[0];
    const companyName = settings?.companyName || 'our company';
    const senderName = settings?.senderName || 'our team';
    const senderEmail = settings?.senderEmail || '';
    const senderPhone = settings?.senderPhone || '';
    const leadNotes = lead?.notes || lead?.industry || 'B2B outreach prospect';

    const nextSlot = (availableSlots || []).find((s: { available: boolean }) => s.available) || availableSlots?.[0];
    const bookingLink = nextSlot
      ? `https://calendar.google.com/booking?date=${nextSlot.date}&slot=${encodeURIComponent(nextSlot.time)}`
      : 'https://meet.google.com/demo-slot';

    const vars: Record<string, string> = {
      name: lead?.name || 'there',
      first_name: firstName,
      company: clientCompany,
      email: lead?.email || '',
      phone: lead?.phone || '',
      company_name: companyName,
      sender_name: senderName,
      sender_email: senderEmail,
      sender_phone: senderPhone,
      booking_link: bookingLink,
    };

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const prompt = `You are an expert B2B copywriter specialized in high-converting WhatsApp messages and cold/warm outreach emails.
Generate a personalized WhatsApp message AND Email for this prospect:
- Client Name: ${lead?.name || 'Prospect'}
- Client Company: ${clientCompany}
- Client Email: ${lead?.email || ''}
- Client Phone: ${lead?.phone || ''}
- Context/Notes: "${leadNotes}"
- Sender Company: ${companyName}
- Sender Name: ${senderName}
- Value Prop: ${settings?.serviceDescription || 'Outreach automation synced with Google Calendar and spreadsheets'}
- Booking Link: ${bookingLink}
- Custom Instructions: "${settings?.customInstructions || 'Keep it friendly, high-value, crisp, and direct.'}"
${template ? `- Base Template Guidance:\nWhatsApp Base: ${template.whatsAppContent}\nEmail Subject Base: ${template.emailSubject}\nEmail Body Base: ${template.emailBody}` : ''}

Output strict JSON with these 3 keys:
{
  "whatsApp": "A concise, engaging WhatsApp message formatted with natural emojis, bolding (*text*), and the booking link ${bookingLink}",
  "emailSubject": "High-open rate email subject line (under 60 chars)",
  "emailBody": "Clear, professional, punchy email with greeting, value prop, bullet points, call to action with booking link, and sender sign-off"
}`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        let parsed: { whatsApp?: string; emailSubject?: string; emailBody?: string } = {};
        try {
          parsed = JSON.parse(response.text || '{}');
        } catch {
          parsed = {};
        }

        if (parsed.whatsApp && parsed.emailSubject && parsed.emailBody) {
          return res.status(200).json({
            whatsApp: parsed.whatsApp,
            emailSubject: parsed.emailSubject,
            emailBody: parsed.emailBody,
            isAiGenerated: true,
          });
        }
      } catch (geminiError) {
        console.warn('Gemini generation fallback:', geminiError);
      }
    }

    // Fallback template interpolation
    if (template) {
      return res.status(200).json({
        whatsApp: interpolate(template.whatsAppContent, vars),
        emailSubject: interpolate(template.emailSubject, vars),
        emailBody: interpolate(template.emailBody, vars),
        isAiGenerated: false,
      });
    }

    // Standard fallback
    return res.status(200).json({
      whatsApp: `Hi ${firstName} 👋! ${senderName} from ${companyName} here. We noticed your work at *${clientCompany}* and wanted to share how you can automate client outreach directly from spreadsheets. Open to a 10-min demo? Grab a slot here: ${bookingLink}`,
      emailSubject: `Automating outreach workflow for ${clientCompany} (10-min Demo)`,
      emailBody: `Hi ${firstName},\n\nI hope you're having a productive week.\n\nI'm reaching out from ${companyName}. We help teams at ${clientCompany} eliminate manual messaging by connecting spreadsheets directly to automated WhatsApp and Email dispatch.\n\nWould you be open to a brief 10-minute introduction this week?\n\nPick a convenient time here:\n👉 ${bookingLink}\n\nBest regards,\n${senderName}\n${companyName}`,
      isAiGenerated: false,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || 'Failed to generate message',
    });
  }
}
