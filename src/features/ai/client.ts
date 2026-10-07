import { supabase } from "@/lib/supabase";

/**
 * Client for Coffee's AI engine.
 *
 * Free tier  — a free open-weight model (NVIDIA Nemotron 3 Super) on the project's
 *              shared OpenRouter key. Every signed-in user gets this with no setup.
 * Power tier — the user saved their own provider API key. Requests run on their quota
 *              and the tools in POWER_TOOLS unlock.
 */

export type AiTier = "free" | "power";
export type AiProvider = "openrouter" | "anthropic";

export interface AiSettingsRow {
  provider: AiProvider;
  model: string;
  /** Masked tail of the saved key, e.g. "…a91f". The key itself is never sent here. */
  key_hint: string | null;
  verified_at: string | null;
  updated_at: string | null;
}

export interface AiStatus {
  tier: AiTier;
  free_model: string;
  settings: AiSettingsRow | null;
  provider_defaults?: Record<AiProvider, string>;
}

/** Thrown when a tool needs the power tier. The UI turns this into an upsell. */
export class PowerTierRequiredError extends Error {
  constructor(message: string, readonly tool?: string) {
    super(message);
    this.name = "PowerTierRequiredError";
  }
}

/** Keep in sync with POWER_TOOLS in supabase/functions/_shared/tier.ts. */
export const POWER_TOOLS = [
  {
    id: "outreach-personalization",
    name: "Outreach personalization",
    blurb:
      "Rewrite a draft message against your resume and the recipient's LinkedIn profile.",
  },
  {
    id: "resume-rewrite",
    name: "Full resume rewrite",
    blurb:
      "Not just keyword suggestions — a complete resume rewritten for one job posting.",
  },
  {
    id: "meeting-transcripts",
    name: "Full-length meeting transcripts",
    blurb:
      "The free engine caps transcripts at ~6,000 characters. Your own key removes the cap.",
  },
] as const;

export const PROVIDER_INFO: Record<
  AiProvider,
  { label: string; keyUrl: string; keyPrefix: string; placeholder: string; hint: string }
> = {
  openrouter: {
    label: "OpenRouter",
    keyUrl: "https://openrouter.ai/keys",
    keyPrefix: "sk-or-",
    placeholder: "nvidia/nemotron-3-ultra-550b-a55b:free",
    hint:
      "One key, every open-weight model. Your own key raises the free-model limits and unlocks paid models too.",
  },
  anthropic: {
    label: "Anthropic",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPrefix: "sk-ant-",
    placeholder: "claude-opus-5-5",
    hint: "Claude models, billed to your Anthropic account. The strongest option, and not free.",
  },
};

/** Models worth offering in the picker. Any valid provider model ID also works. */
export const SUGGESTED_MODELS: Record<AiProvider, { id: string; label: string }[]> = {
  openrouter: [
    {
      id: "nvidia/nemotron-3-ultra-550b-a55b:free",
      label: "Nemotron 3 Ultra 550B — free, 1M context, strongest open weight",
    },
    {
      id: "nvidia/nemotron-3-super-120b-a12b:free",
      label: "Nemotron 3 Super 120B — free, 262K context, JSON mode",
    },
    {
      id: "thinkingmachines/inkling:free",
      label: "Inkling 975B — free, 1M context, multimodal",
    },
    { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B — free, 262K context" },
  ],
  anthropic: [
    { id: "claude-opus-5-5", label: "Claude Opus 5.5 — most capable" },
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 — faster, cheaper" },
    { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 — cheapest" },
  ],
};

interface InvokeResult<T> {
  data: T;
}

/**
 * Calls an Edge Function and turns its error body into a real Error.
 *
 * A non-2xx Edge Function response surfaces as `error` with the body unread, so the
 * server's own message has to be pulled out of `error.context` — otherwise the user
 * just sees "non-2xx status code". A 402 becomes PowerTierRequiredError so callers can
 * show the upsell instead of a generic failure.
 */
export async function invokeAi<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    let detail = error.message;
    let status: number | undefined;
    let tool: string | undefined;

    const res = (error as { context?: Response }).context;
    if (res && typeof res.json === "function") {
      status = res.status;
      try {
        const parsed = await res.json();
        if (parsed?.error) detail = parsed.error;
        if (parsed?.tool) tool = parsed.tool;
      } catch {
        // keep the generic message
      }
    }

    if (status === 402) {
      throw new PowerTierRequiredError(detail, tool);
    }
    throw new Error(detail);
  }

  const payload = data as { error?: string } & InvokeResult<T>;
  if (payload?.error) {
    throw new Error(payload.error);
  }
  return data as T;
}

export function fetchAiStatus(): Promise<AiStatus> {
  return invokeAi<AiStatus>("ai-settings", { action: "status" });
}

export function testAiKey(
  provider: AiProvider,
  model: string,
  apiKey: string,
): Promise<{ ok: boolean; model: string }> {
  return invokeAi("ai-settings", {
    action: "test",
    provider,
    model,
    api_key: apiKey,
  });
}

export function saveAiKey(
  provider: AiProvider,
  model: string,
  apiKey: string,
): Promise<AiStatus> {
  return invokeAi<AiStatus>("ai-settings", {
    action: "save",
    provider,
    model,
    api_key: apiKey,
  });
}

export function removeAiKey(): Promise<AiStatus> {
  return invokeAi<AiStatus>("ai-settings", { action: "remove" });
}

/** Shortens a provider model ID for display: "nvidia/nemotron-3-super…:free" → "Nemotron 3 Super". */
export function prettyModel(id: string): string {
  const bare = id.split("/").pop() ?? id;
  return bare
    .replace(/:free$/, "")
    .replace(/-\d+b(-a\d+b)?$/, "")
    .split("-")
    .map((part) => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}
