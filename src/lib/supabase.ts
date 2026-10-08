import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseMisconfigured = !supabaseUrl || !supabaseAnonKey;

declare global {
  interface Window {
    Clerk?: { session?: { getToken: () => Promise<string | null> } };
  }
}

/**
 * Auth is Clerk's; the database is Supabase's.
 *
 * Supabase is configured to trust Clerk as a third-party auth provider, so it
 * verifies Clerk's session tokens directly against Clerk's published JWKS. No
 * key is shared in either direction and nothing mints tokens on our behalf.
 *
 * `accessToken` reads from `window.Clerk` rather than a React hook because this
 * client is a module singleton and hooks are not available here. Clerk sets that
 * global once it loads; before then the callback returns null and requests go
 * out unauthenticated, which RLS correctly rejects.
 *
 * Setting this option disables supabase-js's own auth module -- any access to
 * `supabase.auth.*` throws. That is the intent: there is exactly one place
 * sessions come from, and it is Clerk.
 */
export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder",
  {
    accessToken: async () => {
      try {
        return (await window.Clerk?.session?.getToken()) ?? null;
      } catch {
        return null;
      }
    },
  },
);
