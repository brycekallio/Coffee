import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { errorResponse, json, preflight } from "../_shared/http.ts";
import { HttpError, requirePower, resolveTier } from "../_shared/tier.ts";
import { callLLM } from "../_shared/llm.ts";

// Resume-vs-JD tailoring. Two modes:
//
//   suggestions (default, free tier) — a list of targeted phrase swaps. Short output,
//       cheap enough to run on the shared free open-weight model.
//   rewrite (power tier) — a full tailored resume. Needs a big output budget and holds
//       the whole resume in context, so it requires the user's own API key.
//
// Deploy: supabase functions deploy adjust-resume --project-ref ypyvkqysnowgegcjydnd

type Mode = "suggestions" | "rewrite";

interface RequestBody {
  resume_text?: string;
  job_description?: string;
  mode?: Mode;
}

function suggestionsPrompt(resumeText: string, jobDescription: string): string {
  return `You are a resume optimization assistant. A student wants to tailor their resume for a specific job posting.

RESUME:
${resumeText}

JOB DESCRIPTION:
${jobDescription}

Analyze the resume against the job description. Suggest targeted keyword and action-verb swaps that better align the resume with the job. Do NOT rewrite the entire resume. Instead, list specific changes in this format:

ORIGINAL: [exact phrase from resume]
SUGGESTED: [improved phrase]
REASON: [brief explanation of why this change helps]

Focus on:
- Action verbs that match the job description's language
- Keywords and skills mentioned in the job posting but missing or weakly stated in the resume
- Quantifiable achievements that could be reframed to match the role
- Industry-specific terminology from the job description

List 5-10 targeted suggestions.`;
}

function rewritePrompt(resumeText: string, jobDescription: string): string {
  return `You are an expert resume writer. Rewrite this student's resume so it targets a specific job posting as closely as honesty allows.

RESUME:
${resumeText}

JOB DESCRIPTION:
${jobDescription}

Return the complete rewritten resume as plain text, ready to paste into a document. Rules:

- Keep every section the original had, in an order that puts what this job cares about first.
- Rewrite bullet points to lead with the action verbs and terminology the job description uses.
- Surface the skills and keywords the posting asks for wherever the resume genuinely supports them.
- Quantify achievements where the original gives you numbers to work with.
- NEVER invent experience, employers, dates, degrees, or metrics that are not in the original resume. If the posting wants something the candidate does not have, leave it out rather than fabricating it.
- No commentary, no markdown fences, no explanation — output the resume text only.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    if (req.method !== "POST") {
      throw new HttpError("Method not allowed", 405);
    }

    const resolved = await resolveTier(req);
    const body: RequestBody = await req.json().catch(() => ({}));

    const resumeText = (body.resume_text ?? "").trim();
    const jobDescription = (body.job_description ?? "").trim();
    const mode: Mode = body.mode === "rewrite" ? "rewrite" : "suggestions";

    if (!resumeText) throw new HttpError("resume_text is required", 400);
    if (!jobDescription) throw new HttpError("job_description is required", 400);

    if (mode === "rewrite") {
      requirePower(resolved, "resume-rewrite");
    }

    const result = await callLLM(resolved.creds, {
      prompt: mode === "rewrite"
        ? rewritePrompt(resumeText, jobDescription)
        : suggestionsPrompt(resumeText, jobDescription),
      // A full rewrite is roughly the length of the resume; suggestions are a short list.
      // Reasoning models spend output tokens on thinking too, so leave headroom.
      maxTokens: mode === "rewrite" ? 16000 : 4000,
    });

    return json({
      suggestions: result.text,
      mode,
      model: result.model,
      provider: result.provider,
      tier: resolved.tier,
    });
  } catch (e) {
    return errorResponse(e);
  }
});
