import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { errorResponse, json, preflight } from "../_shared/http.ts";
import {
  HttpError,
  loadStoredSettings,
  requireUser,
  serviceClient,
} from "../_shared/tier.ts";
import {
  callLLM,
  FREE_MODEL,
  type Provider,
  PROVIDER_DEFAULT_MODEL,
} from "../_shared/llm.ts";

// Reads, validates and stores a user's bring-your-own API key.
//
// Writes go through here rather than straight to the table so that a key is proven to
// work before it is saved — otherwise a typo silently breaks every AI feature with a
// provider error, and the user has no way to tell the key is the problem. The service
// role does the write; `authenticated` has no INSERT/UPDATE policy on the table.
//
// Deploy: supabase functions deploy ai-settings --project-ref ypyvkqysnowgegcjydnd

const PROVIDERS: Provider[] = ["openrouter", "anthropic"];

interface Body {
  action?: "status" | "test" | "save" | "remove";
  provider?: string;
  model?: string;
  api_key?: string;
}

function assertProvider(value: string | undefined): Provider {
  if (!value || !PROVIDERS.includes(value as Provider)) {
    throw new HttpError(
      `provider must be one of: ${PROVIDERS.join(", ")}`,
      400,
    );
  }
  return value as Provider;
}

/** Cheapest possible real call — proves the key authenticates and the model exists. */
async function verifyKey(provider: Provider, model: string, apiKey: string) {
  return await callLLM(
    { provider, model, apiKey },
    { prompt: "Reply with the single word: ok", maxTokens: 16 },
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    if (req.method !== "POST") {
      throw new HttpError("Method not allowed", 405);
    }

    const userId = await requireUser(req);
    const body: Body = await req.json().catch(() => ({}));
    const action = body.action ?? "status";

    // ── status ── what tier is this user on, and which key is saved ──
    if (action === "status") {
      const { data } = await serviceClient()
        .from("user_ai_settings")
        .select("provider, model, key_hint, verified_at, updated_at")
        .eq("id", userId)
        .maybeSingle();

      const stored = await loadStoredSettings(userId);
      return json({
        tier: stored ? "power" : "free",
        free_model: FREE_MODEL,
        settings: data ?? null,
        provider_defaults: PROVIDER_DEFAULT_MODEL,
      });
    }

    // ── remove ── drop back to the free tier ──
    if (action === "remove") {
      const { error } = await serviceClient()
        .from("user_ai_settings")
        .delete()
        .eq("id", userId);
      if (error) throw new HttpError(error.message, 500);
      return json({ tier: "free", free_model: FREE_MODEL, settings: null });
    }

    // ── test / save ── both need a complete, working credential ──
    const provider = assertProvider(body.provider);
    const model = (body.model ?? "").trim() || PROVIDER_DEFAULT_MODEL[provider];
    const apiKey = (body.api_key ?? "").trim();

    if (!apiKey) {
      throw new HttpError("api_key is required", 400);
    }

    const probe = await verifyKey(provider, model, apiKey);

    if (action === "test") {
      return json({ ok: true, provider, model: probe.model });
    }

    if (action === "save") {
      const { error } = await serviceClient()
        .from("user_ai_settings")
        .upsert(
          {
            id: userId,
            provider,
            model,
            api_key: apiKey,
            verified_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
      if (error) throw new HttpError(error.message, 500);

      const { data } = await serviceClient()
        .from("user_ai_settings")
        .select("provider, model, key_hint, verified_at, updated_at")
        .eq("id", userId)
        .maybeSingle();

      return json({
        tier: "power",
        free_model: FREE_MODEL,
        settings: data ?? null,
        verified_model: probe.model,
      });
    }

    throw new HttpError(`Unknown action: ${action}`, 400);
  } catch (e) {
    return errorResponse(e);
  }
});
