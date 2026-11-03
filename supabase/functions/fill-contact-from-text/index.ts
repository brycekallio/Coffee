import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { errorResponse, json, preflight } from "../_shared/http.ts";
import { callModel, HttpError, resolveTier } from "../_shared/tier.ts";
import { fillFromText, FillInputError } from "../_shared/contactFill.ts";

// Reads profile text the user pasted and returns contact fields for the form. Available on
// every tier; on the free tier each call counts against the per-user daily cap (callModel).
// It never fetches anything: the only input is the pasted text.
//
// Deploy: supabase functions deploy fill-contact-from-text --project-ref ypyvkqysnowgegcjydnd

serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    if (req.method !== "POST") throw new HttpError("Method not allowed", 405);

    const resolved = await resolveTier(req);
    const body = await req.json().catch(() => ({}));

    const { fields, model } = await fillFromText((body as { text?: unknown }).text, (r) => callModel(resolved, r));
    return json({ fields, model, tier: resolved.tier });
  } catch (e) {
    if (e instanceof FillInputError) return json({ error: e.message }, e.status);
    return errorResponse(e);
  }
});
