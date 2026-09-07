import { getSupabaseAdmin } from './supabaseAdmin.js';

/**
 * Verifies a Supabase access token (from an `Authorization: Bearer <token>` header sent
 * by the authenticated browser) and returns the org id (= Supabase auth user id), or
 * null if missing/invalid. Org-scoping across the app relies on this.
 */
export async function getOrgIdFromAuthHeader(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}
