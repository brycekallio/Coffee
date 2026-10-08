import { createClient } from "@supabase/supabase-js";
import { getAccessToken } from "./authClient";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseMisconfigured = !supabaseUrl || !supabaseAnonKey;

/**
 * Auth is Cloudflare's; the database is Supabase's.
 *
 * `accessToken` hands supabase-js our Worker-minted JWT for every request, so
 * RLS and auth.uid() keep working exactly as before — Postgres only ever read
 * `sub` out of the token, and it still does.
 *
 * Setting this option disables supabase-js's own auth module: any access to
 * `supabase.auth.*` throws. That is not a bug to work around, it is the whole
 * point — there is only one place sessions come from now, and it is authClient.
 */
export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder",
  { accessToken: () => getAccessToken() },
);
