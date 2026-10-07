import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { errorResponse, json, preflight } from "../_shared/http.ts";
import { HttpError, resolveTier } from "../_shared/tier.ts";
import { callLLM, parseJsonObject } from "../_shared/llm.ts";

// Scores a resume against a job description. Available on every tier.
//
// Deploy: supabase functions deploy score-jd --project-ref ypyvkqysnowgegcjydnd

function buildPrompt(resumeText: string, jdText: string): string {
  const resumeSection = resumeText.trim()
    ? `<resume>\n${resumeText.trim()}\n</resume>`
    : `<resume>No resume provided — score based on JD requirements analysis only. Note in summary that the resume was missing.</resume>`;

  return `You are an expert recruiter and career coach. Score a candidate's fit against a job description.

${resumeSection}

<job_description>
${jdText.trim()}
</job_description>

Analyze the fit and respond with ONLY a valid JSON object — no markdown fences, no text outside the JSON.

{
  "overall_score": <integer 0–100>,
  "label": <"Excellent Match" | "Strong Match" | "Good Match" | "Partial Match" | "Weak Match">,
  "summary": "<2–3 sentence overall assessment, specific to this candidate and role>",
  "strengths": ["<concrete strength 1>", "<concrete strength 2>", "<concrete strength 3>"],
  "gaps": ["<actionable gap 1>", "<actionable gap 2>", "<actionable gap 3>"],
  "sections": [
    { "name": "Technical Skills", "score": <0–100>, "feedback": "<1–2 sentences>" },
    { "name": "Experience Level", "score": <0–100>, "feedback": "<1–2 sentences>" },
    { "name": "Industry & Domain Fit", "score": <0–100>, "feedback": "<1–2 sentences>" },
    { "name": "Key Requirements", "score": <0–100>, "feedback": "<1–2 sentences>" }
  ]
}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const resolved = await resolveTier(req);
    const body = await req.json().catch(() => ({}));
    const { resume_text = "", jd_text = "" } = body as {
      resume_text?: string;
      jd_text?: string;
    };

    if (!jd_text?.trim()) {
      throw new HttpError("jd_text is required", 400);
    }

    const result = await callLLM(resolved.creds, {
      prompt: buildPrompt(resume_text, jd_text),
      // Open-weight reasoning models spend output tokens thinking before the JSON,
      // so this needs far more headroom than the JSON payload itself.
      maxTokens: 8000,
      json: true,
    });

    const parsed = parseJsonObject<Record<string, unknown>>(result.text);
    return json({ ...parsed, model: result.model, tier: resolved.tier });
  } catch (e) {
    return errorResponse(e);
  }
});
