import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { isDemoMode } from "@/demo/mode";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseMisconfigured = !supabaseUrl || !supabaseAnonKey;

declare global {
  interface Window {
    Clerk?: { session?: { getToken: () => Promise<string | null> } };
  }
}

type Client = SupabaseClient<Database>;

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
function createRealClient(): Client {
  return createClient<Database>(
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
}

// ── Which client? Decided here, once. ─────────────────────────────────────────
//
// In the public demo (/demo) the real client must never exist: not constructed, not
// idle, not reachable. So the real one is built lazily, on first use, and only on the
// non-demo branch below; in demo mode that branch is unreachable, and the demo's
// in-memory client is installed by `installDemoClient` before the first render.
let demoClient: Client | null = null;
let realClient: Client | null = null;

/** Called once by the demo bootstrap, before anything renders. Never by the real app. */
export function installDemoClient(client: Client): void {
  if (!isDemoMode) throw new Error("installDemoClient() is only allowed in demo mode");
  demoClient = client;
}

function activeClient(): Client {
  if (isDemoMode) {
    if (!demoClient) throw new Error("Demo database used before the demo client was installed");
    return demoClient;
  }
  return (realClient ??= createRealClient());
}

/**
 * The client every feature imports. A thin forwarding object so callers keep a stable
 * binding while the choice of backend stays lazy; methods are bound so supabase-js's
 * internal `this` is the real client rather than this proxy.
 */
export const supabase: Client = new Proxy({} as Client, {
  get(_target, prop) {
    const client = activeClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
