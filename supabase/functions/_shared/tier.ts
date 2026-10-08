/**
 * Auth + AI tier resolution, shared by every AI Edge Function.
 *
 * Two tiers:
 *   free  — the project's own OPENROUTER_API_KEY against a free open-weight model.
 *           Every signed-in user gets this with zero setup. Rate-limited by OpenRouter
 *           (20 req/min, 50/day shared across all users on a sub-$10 account).
 *   power — the user saved their own provider key in Settings. Runs on their quota,
 *           and unlocks the gated tools listed in POWER_TOOLS.
 *
 * API keys live in `user_ai_settings.api_key`, which is readable only with the service
 * role: SELECT on that one column is revoked from `authenticated`, and users have no
 * INSERT/UPDATE policy at all. Writes go through the `ai-settings` function.
 */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  type Credentials,
  FREE_MODEL,
  FREE_MODEL_CHAIN,
  type Provider,
} from "./llm.ts";

export type Tier = "free" | "power";

/** Tools that require a power-tier key. Keep in sync with src/features/ai/client.ts. */
export const POWER_TOOLS = [
  "outreach-personalization",
  "resume-rewrite",
  "meeting-transcripts",
] as const;

export type PowerTool = (typeof POWER_TOOLS)[number];

/**
 * Free-tier ceiling for meeting transcripts, in characters. Transcripts are the most
 * token-hungry input Coffee has, so the full-length tool is power-tier — but short
 * notes still work for free rather than regressing the feature to a paywall.
 * Set to 0 to gate transcripts entirely.
 */
export const FREE_TRANSCRIPT_CHAR_LIMIT = 6000;

export interface Resolved {
  userId: string;
  tier: Tier;
  creds: Credentials;
}

/** Thrown for any condition that should become a non-500 HTTP response. */
export class HttpError extends Error {
  constructor(message: string, readonly status: number, readonly extra: Record<string, unknown> = {}) {
    super(message);
    this.name = "HttpError";
  }
}

export function serviceClient(): SupabaseClient {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) {
    throw new HttpError("SUPABASE_SERVICE_ROLE_KEY is not configured.", 500);
  }
  return createClient(Deno.env.get("SUPABASE_URL")!, key);
}

/** Rejects unauthenticated callers before any provider credits are spent. */
/**
 * The Supabase user id behind this request.
 *
 * Does NOT call auth.getUser(): that asks GoTrue, which has never seen a Clerk
 * token and answers 401 for every real user. Supabase trusts Clerk as a
 * third-party provider at the API layer, so the token is valid -- it just maps to
 * a Clerk subject rather than a Supabase uuid.
 *
 * app_user_id() is the same function every RLS policy uses to resolve that
 * subject back to the uuid the user's rows are keyed on, so this cannot drift
 * from what the database itself will enforce a moment later.
 */
export async function requireUser(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw new HttpError("Missing Authorization header", 401);
  }
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await userClient.rpc("app_user_id");
  if (error || !data) {
    throw new HttpError("Unauthorized", 401);
  }
  return data as string;
}

export interface StoredSettings {
  provider: Provider;
  model: string;
  api_key: string | null;
}

/** Reads the user's saved BYO key with the service role. Null when they have none. */
export async function loadStoredSettings(
  userId: string,
): Promise<StoredSettings | null> {
  const { data, error } = await serviceClient()
    .from("user_ai_settings")
    .select("provider, model, api_key")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to read user_ai_settings:", error.message);
    return null;
  }
  if (!data?.api_key) return null;
  return data as StoredSettings;
}

/**
 * Resolves which credentials this request runs on. A saved BYO key means power tier;
 * otherwise the shared free open-weight model.
 */
export async function resolveTier(req: Request): Promise<Resolved> {
  const userId = await requireUser(req);
  const stored = await loadStoredSettings(userId);

  if (stored) {
    return {
      userId,
      tier: "power",
      creds: {
        provider: stored.provider,
        model: stored.model,
        apiKey: stored.api_key!,
        // Chain only applies to OpenRouter; a BYO key there still benefits from it.
        fallbacks: stored.provider === "openrouter" ? [] : undefined,
      },
    };
  }

  const sharedKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!sharedKey) {
    throw new HttpError(
      "OPENROUTER_API_KEY is not configured in Supabase secrets, and you have no personal API key saved in Settings.",
      500,
    );
  }

  return {
    userId,
    tier: "free",
    creds: {
      provider: "openrouter",
      model: FREE_MODEL,
      apiKey: sharedKey,
      fallbacks: FREE_MODEL_CHAIN.slice(1),
    },
  };
}

/** Gate for a power-only tool. 402 is what the client watches for to show the upsell. */
export function requirePower(resolved: Resolved, tool: PowerTool): void {
  if (resolved.tier !== "power") {
    throw new HttpError(
      "This tool needs your own API key. Add one under Settings → AI engine to unlock it.",
      402,
      { tool, tier: resolved.tier },
    );
  }
}
