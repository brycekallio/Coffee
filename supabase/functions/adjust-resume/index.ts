import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Server-side port of adjustResumeWithOllama() from src/lib/resumeUtils.ts.
// The Ollama path only ever worked on a machine running Ollama at localhost:11434,
// so it was dead for every invited user. This runs the same prompt against Claude.
//
// Deploy:  supabase functions deploy adjust-resume --project-ref ypyvkqysnowgegcjydnd
// Requires the ANTHROPIC_API_KEY secret, which score-jd / summarize-contact already use:
//          supabase secrets list --project-ref ypyvkqysnowgegcjydnd

const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

const MODEL = "claude-opus-5-5";
// Thinking is always on for this model and thinking tokens count against max_tokens,
// so leave real headroom even though the visible answer is short.
const MAX_TOKENS = 16000;

interface RequestBody {
  resume_text?: string;
  job_description?: string;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildPrompt(resumeText: string, jobDescription: string): string {
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

/**
 * Calls the Messages API. Sends the server-side refusal-fallback beta by default, and
 * retries once without it if this org/project does not have that beta enabled — so a
 * rejected beta flag can never take the whole feature down for real users.
 */
async function callAnthropic(prompt: string, withFallbacks: boolean): Promise<Response> {
  const body: Record<string, unknown> = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    output_config: { effort: "medium" },
    messages: [{ role: "user", content: prompt }],
  };
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": anthropicApiKey!,
    "anthropic-version": "2023-06-01",
  };
  if (withFallbacks) {
    body.fallbacks = "default";
    headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
  }

  return await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ── Auth: reject unauthenticated callers before spending Anthropic API credits ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing Authorization header" }, 401);
  }
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    if (!anthropicApiKey) {
      return json({ error: "ANTHROPIC_API_KEY is not configured in Supabase secrets." }, 500);
    }

    const body: RequestBody = await req.json().catch(() => ({}));
    const resumeText = (body.resume_text ?? "").trim();
    const jobDescription = (body.job_description ?? "").trim();

    if (!resumeText) {
      return json({ error: "resume_text is required" }, 400);
    }
    if (!jobDescription) {
      return json({ error: "job_description is required" }, 400);
    }

    const prompt = buildPrompt(resumeText, jobDescription);

    let res = await callAnthropic(prompt, true);
    if (res.status === 400) {
      // Could be the beta flag rather than the prompt — retry once plainly before failing.
      const firstError = await res.text();
      console.warn("Anthropic 400 with fallbacks beta, retrying without it:", firstError);
      res = await callAnthropic(prompt, false);
    }

    if (!res.ok) {
      const errText = await res.text();
      console.error("Anthropic API error:", res.status, errText);
      throw new Error(`Anthropic API error (${res.status})`);
    }

    const result = await res.json();

    if (result.stop_reason === "refusal") {
      return json(
        {
          error:
            "The model declined to analyze this resume and job description. Try rephrasing or removing unusual content.",
        },
        422
      );
    }

    // Thinking blocks can precede the answer, so find the text block rather than
    // assuming content[0].
    const suggestions: string = (result.content ?? [])
      .filter((b: { type?: string }) => b?.type === "text")
      .map((b: { text?: string }) => b.text ?? "")
      .join("\n")
      .trim();

    if (!suggestions) {
      if (result.stop_reason === "max_tokens") {
        throw new Error("The model ran out of output budget before writing any suggestions.");
      }
      throw new Error("The model returned no suggestions.");
    }

    return json({ suggestions, model: result.model ?? MODEL });
  } catch (error) {
    console.error("Error:", error);
    return json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});
