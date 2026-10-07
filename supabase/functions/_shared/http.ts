import { corsHeaders } from "./cors.ts";
import { HttpError } from "./tier.ts";
import { LlmError } from "./llm.ts";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/**
 * Single error funnel so every AI function answers the same shape. HttpError and
 * LlmError carry their own status (401 unauthenticated, 402 power-tier gate,
 * 429 rate limited, 422 refusal); anything else is a genuine 500.
 */
export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) {
    return json({ error: e.message, ...e.extra }, e.status);
  }
  if (e instanceof LlmError) {
    return json({ error: e.message, provider: e.provider }, e.status);
  }
  console.error("Unhandled error:", e);
  return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
}
