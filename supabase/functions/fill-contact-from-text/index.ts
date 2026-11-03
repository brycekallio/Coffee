import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { errorResponse, json, preflight } from "../_shared/http.ts";
import { callModel, HttpError, resolveTier } from "../_shared/tier.ts";
import { fillFromText, FillInputError } from "../_shared/contactFill.ts";

// Reads profile text the user pasted and returns contact fields for the form. Available on
// every tier; on the free tier each call counts against the per-user daily cap (callModel).
// It never fetches anything: the only input is the pasted text.
//
// Deploy: supabase functions deploy fill-contact-from-text --project-ref ypyvkqysnowgegcjydnd

/**
 * 15k characters of pasted text is at most ~90 KB as JSON (every char escaped as \uXXXX).
 * Anything bigger is refused before it is parsed. A body that isn't a JSON object becomes {}.
 */
const MAX_BODY_BYTES = 128 * 1024;

async function readBody(req: Request): Promise<{ text?: unknown }> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new HttpError("That's too much text. Paste just the top of the profile.", 413);
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) throw new HttpError("That's too much text. Paste just the top of the profile.", 413);
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as { text?: unknown }) : {};
  } catch {
    return {};
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    if (req.method !== "POST") throw new HttpError("Method not allowed", 405);

    const resolved = await resolveTier(req);
    const body = await readBody(req);

    const { fields, model } = await fillFromText(body.text, (r) => callModel(resolved, r));
    return json({ fields, model, tier: resolved.tier });
  } catch (e) {
    if (e instanceof FillInputError) return json({ error: e.message }, e.status);
    return errorResponse(e);
  }
});
