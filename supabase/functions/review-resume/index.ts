import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { errorResponse, json, preflight } from "../_shared/http.ts";
import { callModel, HttpError, resolveTier } from "../_shared/tier.ts";
import {
  buildQuestionsRequest,
  buildReviewRequest,
  parseQuestions,
  parseReview,
  prepareReviewInput,
  ReviewFormatError,
  ReviewInputError,
} from "../_shared/resumeReview.ts";

// Resume review in two steps, from the playbook in assets/resume-advice/:
//   mode "questions" -> up to 8 probing questions about the resume
//   mode "review"    -> the scored review, using the student's answers
// Available on every tier. Each step is one model call through callModel, so on the free
// tier each counts as one of the per-user daily requests. Rewrites are checked server-side:
// a number the student did not write becomes [X].
//
// Deploy: supabase functions deploy review-resume --project-ref ypyvkqysnowgegcjydnd

/** 12k resume + 6k posting + answers is at most ~230 KB as JSON when every char is escaped. */
const MAX_BODY_BYTES = 256 * 1024;

async function readBody(req: Request): Promise<unknown> {
  const tooBig = () => new HttpError("That's too much text to review in one go. Trim the resume or the posting.", 413);
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw tooBig();
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) throw tooBig();
  try {
    return JSON.parse(raw);
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
    const mode = (body as { mode?: unknown } | null)?.mode === "review" ? "review" : "questions";
    const input = prepareReviewInput(body, mode === "review");

    if (mode === "questions") {
      const result = await callModel(resolved, buildQuestionsRequest(input));
      return json({ mode, questions: parseQuestions(result.text), model: result.model, tier: resolved.tier });
    }

    const result = await callModel(resolved, buildReviewRequest(input));
    return json({ mode, review: parseReview(result.text, input), model: result.model, tier: resolved.tier });
  } catch (e) {
    if (e instanceof ReviewInputError) return json({ error: e.message }, e.status);
    if (e instanceof ReviewFormatError) return json({ error: e.message }, 422);
    return errorResponse(e);
  }
});
