import { getOrgIdFromAuthHeader } from '../../../lib/supabaseServerAuth.js';
import { buildGoogleAuthUrl, isGoogleOAuthConfigured } from '../../../lib/googleOAuthFlow.js';

interface ApiRequest {
  method?: string;
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

  if (!isGoogleOAuthConfigured()) {
    return res.status(500).json({ error: 'Google Calendar OAuth is not configured on the server yet.' });
  }

  const authHeader = req.headers?.authorization as string | undefined;
  const orgId = await getOrgIdFromAuthHeader(authHeader);
  if (!orgId) {
    return res.status(401).json({ error: 'Sign in required.' });
  }

  const authUrl = buildGoogleAuthUrl(orgId);
  if (!authUrl) {
    return res.status(500).json({ error: 'Failed to build Google authorization URL.' });
  }

  return res.status(200).json({ authUrl });
}
