import { google } from 'googleapis';
import { signOAuthState, verifyOAuthState } from './googleOAuthState.js';
import { saveOrgGoogleCalendarToken } from './orgSettings.js';

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function isGoogleOAuthConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REDIRECT_URI);
}

export function buildGoogleAuthUrl(orgId: string): string | null {
  const client = getOAuthClient();
  if (!client) return null;
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/userinfo.email'],
    state: signOAuthState(orgId),
  });
}

export interface GoogleOAuthCallbackResult {
  ok: boolean;
  orgId?: string;
  error?: string;
}

export async function handleGoogleOAuthCallback(code: string | undefined, state: string | undefined): Promise<GoogleOAuthCallbackResult> {
  const orgId = verifyOAuthState(state);
  if (!orgId) {
    return { ok: false, error: 'Invalid or expired connection request. Please try connecting again.' };
  }
  if (!code) {
    return { ok: false, error: 'Google did not return an authorization code.' };
  }

  const client = getOAuthClient();
  if (!client) {
    return { ok: false, error: 'Google Calendar OAuth is not configured on the server.' };
  }

  try {
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      return {
        ok: false,
        error:
          'Google did not return a refresh token (this happens if you previously connected this account). Revoke access at https://myaccount.google.com/permissions for this app and try connecting again.',
      };
    }

    client.setCredentials(tokens);
    let connectedEmail: string | undefined;
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: client });
      const info = await oauth2.userinfo.get();
      connectedEmail = info.data.email || undefined;
    } catch {
      // Non-fatal — email is just a display label.
    }

    await saveOrgGoogleCalendarToken(orgId, { refreshToken: tokens.refresh_token, connectedEmail });
    return { ok: true, orgId };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Failed to complete Google Calendar connection.' };
  }
}
