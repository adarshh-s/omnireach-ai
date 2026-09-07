import crypto from 'crypto';

/**
 * Signs the org id into the Google OAuth `state` param so the callback (a plain
 * redirect with no session/auth header) can trust which org initiated the connect
 * request, without a guessable or tamperable value.
 */
export function signOAuthState(orgId: string): string {
  const secret = process.env.OAUTH_STATE_SECRET || '';
  const payload = `${orgId}.${Date.now()}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}.${signature}`).toString('base64url');
}

export function verifyOAuthState(state: string | undefined): string | null {
  if (!state) return null;
  const secret = process.env.OAUTH_STATE_SECRET || '';
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const parts = decoded.split('.');
    if (parts.length !== 3) return null;
    const [orgId, timestamp, signature] = parts;
    const payload = `${orgId}.${timestamp}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

    // 15-minute window to complete the OAuth consent flow.
    const age = Date.now() - Number(timestamp);
    if (!Number.isFinite(age) || age < 0 || age > 15 * 60 * 1000) return null;

    return orgId;
  } catch {
    return null;
  }
}
