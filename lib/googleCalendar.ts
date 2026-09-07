import { google } from 'googleapis';

function getOAuthClient(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });
  return oAuth2Client;
}

export interface CreateMeetingParams {
  refreshToken: string;
  calendarId?: string;
  summary: string;
  description?: string;
  startIso: string;
  durationMinutes: number;
  attendeeEmail?: string;
  attendeeName?: string;
}

export interface CreateMeetingResult {
  eventId: string;
  meetLink: string;
  htmlLink: string;
}

export async function createMeetingEvent(params: CreateMeetingParams): Promise<CreateMeetingResult | null> {
  const auth = getOAuthClient(params.refreshToken);
  if (!auth) return null;

  const calendar = google.calendar({ version: 'v3', auth });
  const calendarId = params.calendarId || 'primary';

  const start = new Date(params.startIso);
  const end = new Date(start.getTime() + params.durationMinutes * 60000);

  const event = await calendar.events.insert({
    calendarId,
    conferenceDataVersion: 1,
    sendUpdates: 'all',
    requestBody: {
      summary: params.summary,
      description: params.description,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      attendees: params.attendeeEmail ? [{ email: params.attendeeEmail, displayName: params.attendeeName }] : undefined,
      conferenceData: {
        createRequest: {
          requestId: `omnireach-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    },
  });

  const meetLink =
    event.data.hangoutLink ||
    event.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ||
    '';

  return {
    eventId: event.data.id || '',
    meetLink,
    htmlLink: event.data.htmlLink || '',
  };
}
