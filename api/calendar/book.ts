interface ApiRequest {
  method?: string;
  body?: Record<string, unknown>;
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
    const { date, time, lead } = (req.body || {}) as {
      date?: string;
      time?: string;
      lead?: { name?: string; email?: string };
    };
    const meetCode = `${Math.random().toString(36).substring(2, 5)}-${Math.random().toString(36).substring(2, 6)}-${Math.random().toString(36).substring(2, 5)}`;
    const meetLink = `https://meet.google.com/${meetCode}`;

    return res.status(200).json({
      success: true,
      bookingId: `gcal-${Date.now()}`,
      meetLink,
      date,
      time,
      clientName: lead?.name,
      clientEmail: lead?.email,
      confirmedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return res.status(500).json({ error: err.message || 'Failed to book calendar slot' });
  }
}
