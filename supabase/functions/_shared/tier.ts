/**
 * Auth + AI tier resolution, shared by every AI Edge Function.
 *
 * Two tiers:
 *   free  — the project's own OPENROUTER_API_KEY against a free open-weight model.
 *           Every signed-in user gets this with zero setup. Rate-limited by OpenRouter
 *           (20 req/min, 50/day shared across all users on a sub-$10 account), and by
 *           Coffee itself to freeDailyLimit() requests per user per day.
 *   power — the user saved their own provider key in Settings. Runs on their quota,
 *           and unlocks the gated tools listed in POWER_TOOLS.
 *
 * API keys live in `user_ai_settings.api_key`, which is readable only with the service
 * role: SELECT on that one column is revoked from `authenticated`, and users have no
 * INSERT/UPDATE policy at all. Writes go through the `ai-settings` function.
 */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  callLLM,
  type Credentials,
  FREE_MODEL,
  FREE_MODEL_CHAIN,
  LlmError,
  type LlmRequest,
  type LlmResponse,
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

/**
 * Per-user daily cap on the shared free tier.
 *
 * The free tier's real ceiling is OpenRouter's: 50 requests/day for the whole project,
 * shared by every user. Sign-ups are open, so without a per-user cap one account could
 * spend the day's 50 and leave everyone else with "rate limited". The cap is a config
 * value -- the `FREE_AI_DAILY_LIMIT_PER_USER` Edge Function secret -- with this default
 * when it is unset. 0 turns the free tier off. Days are UTC, like OpenRouter's.
 *
 * Users with their own key (power tier) are never counted.
 */
export const DEFAULT_FREE_DAILY_LIMIT = 10;

export function freeDailyLimit(): number {
  const raw = Deno.env.get("FREE_AI_DAILY_LIMIT_PER_USER")?.trim();
  if (!raw) return DEFAULT_FREE_DAILY_LIMIT;
  // Plain digits only: Number() would also accept "1e3" and "0x10", and anything past
  // Postgres' integer range would make every free request fail.
  const n = /^\d{1,6}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(n)) {
    console.error(`Ignoring FREE_AI_DAILY_LIMIT_PER_USER=${JSON.stringify(raw)}; using ${DEFAULT_FREE_DAILY_LIMIT}.`);
    return DEFAULT_FREE_DAILY_LIMIT;
  }
  return n;
}

/** "in about 5 hours" until the next UTC midnight, when the count resets. */
export function resetPhrase(now: Date): string {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const hours = Math.ceil((next - now.getTime()) / 3_600_000);
  if (hours <= 1) return "within the hour";
  return `in about ${hours} hours`;
}

/**
 * Counts one free-tier request against the caller's daily cap, or refuses with a 429.
 *
 * Call it immediately before the model call, after every other check (bad input,
 * the power-tier gate), so a request that was going to be refused anyway costs nothing.
 * The count lives in `ai_free_usage` and is bumped by `consume_free_ai_request()`, an
 * atomic insert-or-increment that only service_role can execute (see
 * docs/migration_2026-11-02_free_ai_cap.sql). If that bookkeeping fails, the request is
 * refused rather than let through uncounted: an outage must not become a way around the cap.
 */
export async function spendFreeRequest(resolved: Resolved, now = new Date()): Promise<void> {
  if (resolved.tier !== "free") return;

  const limit = freeDailyLimit();
  const { data, error } = await serviceClient().rpc("consume_free_ai_request", {
    p_user: resolved.userId,
    p_limit: limit,
  });

  if (error) {
    console.error("consume_free_ai_request failed:", error.message);
    throw new HttpError(
      "The free AI engine is unavailable right now. Try again in a minute, or add your own API key under Settings → AI engine.",
      503,
    );
  }

  if (data === null || data === undefined) {
    throw new HttpError(
      limit === 0
        ? "The free AI engine is switched off right now. Add your own API key under Settings → AI engine to keep using AI tools."
        : `You've used today's ${limit} free AI requests. More arrive ${resetPhrase(now)}, or add your own API key under Settings → AI engine for no daily limit.`,
      429,
      { reason: "free_daily_limit", limit, tier: resolved.tier },
    );
  }
}

/**
 * Provider answers that mean the shared key did no work for this request: rate limited
 * (429: OpenRouter's own daily or per-minute cap is hit) or the project key was rejected
 * (401/403: our misconfiguration). The user gets the slot back for these. Anything else
 * -- a model error, empty or unparseable output -- ran on the shared quota and stays
 * counted, so a crafted bad request can't spend the shared key for free.
 */
const REFUNDED_PROVIDER_STATUSES = new Set([401, 403, 429]);

async function refundFreeRequest(resolved: Resolved): Promise<void> {
  const { error } = await serviceClient().rpc("refund_free_ai_request", { p_user: resolved.userId });
  if (error) console.error("refund_free_ai_request failed:", error.message);
}

/**
 * Largest prompt (system + user text, in characters) the shared free key will send.
 * The daily cap counts requests, not size, so without this one free request could carry
 * a million characters. ~40k fits a full resume plus a long job posting, or a contact's
 * whole meeting history; anything bigger is a power-tier job.
 */
export const FREE_PROMPT_CHAR_LIMIT = 40_000;

function assertFreePromptSize(resolved: Resolved, req: LlmRequest): void {
  if (resolved.tier !== "free") return;
  const size = req.prompt.length + (req.system?.length ?? 0);
  if (size > FREE_PROMPT_CHAR_LIMIT) {
    throw new HttpError(
      `That's more text than the free AI engine takes in one go (${size.toLocaleString("en-US")} characters; the limit is ${FREE_PROMPT_CHAR_LIMIT.toLocaleString("en-US")}). Shorten it, or add your own API key under Settings → AI engine.`,
      413,
      { reason: "free_prompt_too_large", limit: FREE_PROMPT_CHAR_LIMIT, size, tier: resolved.tier },
    );
  }
}

/**
 * The one way an AI function calls a model for a user: checks the free tier's size limit,
 * counts the request against the daily cap, then calls. A refused request costs no slot.
 */
export async function callModel(resolved: Resolved, req: LlmRequest): Promise<LlmResponse> {
  assertFreePromptSize(resolved, req);
  await spendFreeRequest(resolved);
  try {
    return await callLLM(resolved.creds, req);
  } catch (e) {
    if (resolved.tier === "free" && e instanceof LlmError && REFUNDED_PROVIDER_STATUSES.has(e.status)) {
      await refundFreeRequest(resolved);
    }
    throw e;
  }
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
