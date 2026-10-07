import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { errorResponse, json, preflight } from "../_shared/http.ts";
import { HttpError, requirePower, resolveTier } from "../_shared/tier.ts";
import { callLLM, unfence } from "../_shared/llm.ts";

// Rewrites a draft outreach message against the sender's resume and the recipient's
// details. Power tier only.
//
// This replaces personalizeOutreachWithOllama(), which called localhost:11434 from the
// browser — so the feature only ever worked on a machine running Ollama and was dead
// for every invited user. Running it server-side on the user's own key makes it real.
//
// Deploy: supabase functions deploy personalize-outreach --project-ref ypyvkqysnowgegcjydnd

interface RequestBody {
  resume_text?: string | null;
  contact_info?: string;
  linkedin_preview?: string | null;
  current_message?: string;
}

function buildPrompt(body: Required<RequestBody>): string {
  let context = "";
  if (body.resume_text) {
    context += `MY BACKGROUND (from resume):\n${body.resume_text}\n\n`;
  }
  context += `RECIPIENT INFO:\n${body.contact_info}\n\n`;
  if (body.linkedin_preview) {
    context += `RECIPIENT'S LINKEDIN PROFILE:\n${body.linkedin_preview}\n\n`;
  }

  return `You are helping a student personalize a networking outreach message. Use the context below to make the message feel personal, specific, and genuine — not generic.

${context}DRAFT MESSAGE TO PERSONALIZE:
${body.current_message}

Rewrite the message to:
- Reference specific details about the recipient (their role, company, background from LinkedIn)
- Connect the sender's background/interests to the recipient's work where relevant
- Keep the same tone, intent, and approximate length as the draft
- Sound natural and human — not overly formal or robotic
- Replace any placeholder text like [Your Name] with appropriate references
- Never invent facts about either person that the context above does not support

Return ONLY the personalized message text, nothing else — no preamble, no quotes, no markdown fences.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    if (req.method !== "POST") {
      throw new HttpError("Method not allowed", 405);
    }

    const resolved = await resolveTier(req);
    requirePower(resolved, "outreach-personalization");

    const body: RequestBody = await req.json().catch(() => ({}));
    const currentMessage = (body.current_message ?? "").trim();

    if (!currentMessage) {
      throw new HttpError("current_message is required", 400);
    }

    const result = await callLLM(resolved.creds, {
      prompt: buildPrompt({
        resume_text: body.resume_text ?? null,
        contact_info: (body.contact_info ?? "").trim() || "No contact selected",
        linkedin_preview: body.linkedin_preview ?? null,
        current_message: currentMessage,
      }),
      maxTokens: 6000,
    });

    return json({
      message: unfence(result.text),
      model: result.model,
      tier: resolved.tier,
    });
  } catch (e) {
    return errorResponse(e);
  }
});
