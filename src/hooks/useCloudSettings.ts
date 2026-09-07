import { useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseBrowserConfigured } from '../lib/supabaseClient';

/**
 * Persists a settings object either to Supabase (scoped to the signed-in org, via RLS)
 * when authenticated, or to localStorage otherwise — same shape either way, so callers
 * (App.tsx) don't need to know which backend is active. This is what lets the Settings
 * dashboard be per-organization once multi-tenant auth is configured, while still working
 * standalone (single workspace, browser-only) when it isn't.
 */
export function useCloudSettings<T>(
  table: 'org_profile' | 'org_channel_settings',
  localStorageKey: string,
  defaultValue: T,
  userId: string | null | undefined
): [T, (value: T) => void, { loading: boolean }] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(localStorageKey);
      if (saved) {
        try {
          return { ...defaultValue, ...JSON.parse(saved) };
        } catch {}
      }
    }
    return defaultValue;
  });
  const [loading, setLoading] = useState(false);
  const loadedForUser = useRef<string | null>(null);

  // Load from Supabase whenever a signed-in org becomes available.
  useEffect(() => {
    if (!isSupabaseBrowserConfigured || !supabase || !userId) return;
    if (loadedForUser.current === userId) return;
    loadedForUser.current = userId;

    setLoading(true);
    supabase
      .from(table)
      .select('settings')
      .eq('org_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.settings) {
          setValue({ ...defaultValue, ...data.settings });
        }
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, table]);

  // Mirror to localStorage always (instant reload / offline fallback / pre-auth cache).
  useEffect(() => {
    try {
      localStorage.setItem(localStorageKey, JSON.stringify(value));
    } catch {}
  }, [value, localStorageKey]);

  // Persist to Supabase (debounced) whenever signed in.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isSupabaseBrowserConfigured || !supabase || !userId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      supabase!.from(table).upsert(
        { org_id: userId, settings: value, updated_at: new Date().toISOString() },
        { onConflict: 'org_id' }
      );
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, userId, table]);

  return [value, setValue, { loading }];
}
