import { getSupabaseAdmin } from '../../lib/supabaseAdmin';
import { getOrgIdFromAuthHeader } from '../../lib/supabaseServerAuth';

interface ApiRequest {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (data: unknown) => void;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(200).json({ configured: false, conversations: [] });
  }

  const orgId = await getOrgIdFromAuthHeader(req.headers?.authorization as string | undefined);
  if (!orgId) {
    return res.status(401).json({ error: 'Sign in required.' });
  }

  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('org_id', orgId)
    .order('last_message_at', { ascending: false })
    .limit(200);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ configured: true, conversations: data });
}
