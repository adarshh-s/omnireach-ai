import { handleGoogleOAuthCallback } from '../../../lib/googleOAuthFlow';

interface ApiRequest {
  method?: string;
  query?: Record<string, unknown>;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  redirect: (url: string) => void;
  send: (data: unknown) => void;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const code = (req.query?.code as string) || undefined;
  const state = (req.query?.state as string) || undefined;

  const result = await handleGoogleOAuthCallback(code, state);

  const redirectTo = result.ok
    ? `/?google_calendar=connected`
    : `/?google_calendar=error&message=${encodeURIComponent(result.error || 'Connection failed')}`;

  res.status(302).redirect(redirectTo);
}
