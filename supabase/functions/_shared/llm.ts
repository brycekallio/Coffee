/**
 * Provider-agnostic LLM client for Coffee's Edge Functions.
 *
 * The default engine is a **free open-weight model on OpenRouter**, paid for by the
 * project's own OPENROUTER_API_KEY. That is what every signed-in user gets without
 * configuring anything. Anthropic is no longer the default — it is one of the
 * bring-your-own-key providers a power user can opt into (see tier.ts).
 *
 * Why Nemotron 3 Super is the free default: three of Coffee's four AI features parse
 * strict JSON out of the response, and it is the only large free model on OpenRouter
 * that advertises both `response_format` and `structured_outputs`. The 1M-context
 * Nemotron Ultra is more capable but supports neither, so it can only serve prose.
 */

export type Provider = "openrouter" | "anthropic";

/** Primary free model: open-weight 120B MoE (12B active), 262K context, JSON mode. */
export const FREE_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

/**
 * Fallback chain for the free tier. OpenRouter walks this list on *any* error from
 * the current model — including the 429 that a shared free key will hit regularly —
 * and bills/reports whichever model actually answered. Ordered JSON-capable first.
 */
export const FREE_MODEL_CHAIN = [
  FREE_MODEL,
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "openrouter/free",
];

/** Prose-only free model. No JSON mode, but 1M context and the strongest reasoning. */
export const FREE_MODEL_LONG_CONTEXT = "nvidia/nemotron-3-ultra-550b-a55b:free";

/** Defaults offered in the UI when a power user picks a provider. */
export const PROVIDER_DEFAULT_MODEL: Record<Provider, string> = {
  openrouter: "nvidia/nemotron-3-ultra-550b-a55b:free",
  anthropic: "claude-opus-5-5",
};

export interface Credentials {
  provider: Provider;
  model: string;
  apiKey: string;
  /** Extra models to fall back to, OpenRouter only. */
  fallbacks?: string[];
}

export interface LlmRequest {
  prompt: string;
  maxTokens: number;
  /** Ask the provider to emit a bare JSON object. Silently skipped if unsupported. */
  json?: boolean;
  system?: string;
}

export interface LlmResponse {
  text: string;
  /** The model that actually answered — with a fallback chain this is not the one asked for. */
  model: string;
  provider: Provider;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly provider: Provider,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/** Human-readable reason for a provider failure, so the UI can say something useful. */
function describeFailure(status: number, body: string, provider: Provider): string {
  if (status === 401 || status === 403) {
    return provider === "openrouter"
      ? "OpenRouter rejected the API key."
      : "Anthropic rejected the API key.";
  }
  if (status === 429) {
    return provider === "openrouter"
      ? "Every free model is rate-limited right now. Free accounts get 20 requests/minute and 50/day (1,000/day once $10 of credits has ever been purchased). Add your own key in Settings to bypass this."
      : "The provider rate-limited this request. Try again shortly.";
  }
  if (status === 402) {
    return "The provider reports an insufficient balance on this key.";
  }
  // Surface a short slice of the provider's own message — it is usually the real cause.
  const detail = body.slice(0, 300).replace(/\s+/g, " ").trim();
  return `Provider error (${status})${detail ? `: ${detail}` : ""}`;
}

/** Strips a ```json fence if a model ignored the instruction not to use one. */
export function unfence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

/** Pulls the first balanced JSON object out of a response and parses it. */
export function parseJsonObject<T>(text: string): T {
  const cleaned = unfence(text);
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(
      "The model did not return parseable JSON. Raw: " + cleaned.slice(0, 200),
    );
  }
  return JSON.parse(match[0]) as T;
}

async function callOpenRouter(
  creds: Credentials,
  req: LlmRequest,
): Promise<LlmResponse> {
  const messages: Array<{ role: string; content: string }> = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  messages.push({ role: "user", content: req.prompt });

  const body: Record<string, unknown> = {
    model: creds.model,
    messages,
    max_tokens: req.maxTokens,
  };
  // `models` is OpenRouter's fallback chain: it retries the next entry on any error
  // from the current one (rate limit, downtime, context overflow) inside one request.
  if (creds.fallbacks?.length) {
    body.models = [creds.model, ...creds.fallbacks];
  }
  if (req.json) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      "Content-Type": "application/json",
      // Attribution headers — these are what put the app on OpenRouter's dashboards.
      "HTTP-Referer": "https://coffee.netlify.app",
      "X-Title": "Coffee",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("OpenRouter error:", res.status, errText);
    throw new LlmError(
      describeFailure(res.status, errText, "openrouter"),
      res.status,
      "openrouter",
    );
  }

  const data = await res.json();
  // An OpenRouter error can arrive inside a 200 body when a provider fails mid-stream.
  if (data?.error) {
    throw new LlmError(
      describeFailure(Number(data.error.code) || 502, data.error.message ?? "", "openrouter"),
      502,
      "openrouter",
    );
  }

  const text: string = (data.choices?.[0]?.message?.content ?? "").trim();
  if (!text) {
    const finish = data.choices?.[0]?.finish_reason;
    throw new LlmError(
      finish === "length"
        ? "The model ran out of output budget before writing anything."
        : "The model returned an empty response.",
      502,
      "openrouter",
    );
  }

  // Read `model` off the response, not the request — a fallback may have served it.
  return { text, model: data.model ?? creds.model, provider: "openrouter" };
}

async function callAnthropic(
  creds: Credentials,
  req: LlmRequest,
): Promise<LlmResponse> {
  const body: Record<string, unknown> = {
    model: creds.model,
    max_tokens: req.maxTokens,
    messages: [{ role: "user", content: req.prompt }],
  };
  if (req.system) body.system = req.system;

  // Thinking is always on and unconfigurable on the current Claude models, and thinking
  // tokens count against max_tokens — so `effort` is the only spend control, and
  // max_tokens needs real headroom even when the visible answer is short.
  if (/^claude-(opus-5|sonnet-5|fable-5|haiku-5)/.test(creds.model)) {
    body.output_config = { effort: "medium" };
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": creds.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Anthropic error:", res.status, errText);
    throw new LlmError(
      describeFailure(res.status, errText, "anthropic"),
      res.status,
      "anthropic",
    );
  }

  const data = await res.json();

  if (data.stop_reason === "refusal") {
    throw new LlmError(
      "The model declined this request. Try rephrasing or removing unusual content.",
      422,
      "anthropic",
    );
  }

  // Thinking blocks precede the answer, so find the text block rather than content[0].
  const text: string = (data.content ?? [])
    .filter((b: { type?: string }) => b?.type === "text")
    .map((b: { text?: string }) => b.text ?? "")
    .join("\n")
    .trim();

  if (!text) {
    throw new LlmError(
      data.stop_reason === "max_tokens"
        ? "The model ran out of output budget before writing anything."
        : "The model returned an empty response.",
      502,
      "anthropic",
    );
  }

  return { text, model: data.model ?? creds.model, provider: "anthropic" };
}

export function callLLM(creds: Credentials, req: LlmRequest): Promise<LlmResponse> {
  switch (creds.provider) {
    case "openrouter":
      return callOpenRouter(creds, req);
    case "anthropic":
      return callAnthropic(creds, req);
    default:
      throw new LlmError(`Unsupported provider: ${creds.provider}`, 400, "openrouter");
  }
}
