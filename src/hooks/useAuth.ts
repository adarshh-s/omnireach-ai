import { useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseBrowserConfigured } from '../lib/supabaseClient';

export interface AuthState {
  configured: boolean;
  session: Session | null;
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseBrowserConfigured);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return {
    configured: isSupabaseBrowserConfigured,
    session,
    user: session?.user ?? null,
    accessToken: session?.access_token ?? null,
    loading,
    signUp: async (email, password) => {
      if (!supabase) return { error: 'Not configured' };
      const { error } = await supabase.auth.signUp({ email, password });
      return { error: error?.message ?? null };
    },
    signIn: async (email, password) => {
      if (!supabase) return { error: 'Not configured' };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    signOut: async () => {
      if (!supabase) return;
      await supabase.auth.signOut();
    },
  };
}
