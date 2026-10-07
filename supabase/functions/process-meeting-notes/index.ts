import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { errorResponse, json, preflight } from "../_shared/http.ts";
import {
  FREE_TRANSCRIPT_CHAR_LIMIT,
  HttpError,
  requirePower,
  resolveTier,
} from "../_shared/tier.ts";
import { callLLM, parseJsonObject } from "../_shared/llm.ts";

// Turns a networking-call transcript into fun facts / action items / details.
//
// Transcripts are the most token-hungry input Coffee has, so full-length ones are a
// power-tier tool. Short notes (under FREE_TRANSCRIPT_CHAR_LIMIT) still run on the
// shared free model so the feature is not a hard paywall for casual use.
//
// Deploy: supabase functions deploy process-meeting-notes --project-ref ypyvkqysnowgegcjydnd

interface ParsedResult {
  suggested_title?: string;
  fun_facts?: string[];
  action_items?: string[];
  important_details?: string[];
}

function buildPrompt(
  transcript: string,
  contactName: string,
  contactCompany: string,
  meetingDate: string,
): string {
  return `You are a personal CRM assistant helping someone track their professional networking relationships.

Analyze this meeting transcript from a networking call on ${meetingDate} with ${contactName}${
    contactCompany ? ` at ${contactCompany}` : ""
  }.

<transcript>
${transcript.trim()}
</transcript>

Extract exactly three categories of information and respond with ONLY a valid JSON object — no markdown fences, no text outside the JSON.

{
  "suggested_title": "<short label for this meeting, e.g. 'Coffee chat' or 'Intro call'>",
  "fun_facts": [
    "<interesting personal detail about ${contactName} that humanizes them — hobbies, background, family, fun story they told, etc.>"
  ],
  "action_items": [
    "<specific thing YOU need to do as a follow-up — be concrete, e.g. 'Send them the McKinsey article on tech strategy' or 'Intro them to Sarah at Deloitte'>"
  ],
  "important_details": [
    "<professional context worth remembering — their current role, career goals, what they're working on, their perspective on the industry, etc.>"
  ]
}

Rules:
- Each array should have 1–4 items. Omit a category entirely if the transcript has no relevant content for it (use an empty array []).
- Be specific and concrete, not generic. Capture details that will be genuinely useful 6 months from now.
- Fun facts should be memorable human details, not professional info.
- Action items should be actionable by you, not vague intentions.
- Important details should be substantive professional context, not trivial observations.
- If the transcript is too short or unclear to extract meaningful info, return whatever you can with short arrays.`;
}

function formatNotesFromResult(result: ParsedResult, meetingDate: string): string {
  const lines: string[] = [`📅 ${meetingDate}`, ""];

  const section = (heading: string, items: string[] | undefined) => {
    if (!items?.length) return;
    lines.push(heading);
    for (const item of items) lines.push(`• ${item}`);
    lines.push("");
  };

  section("✨ Fun Facts", result.fun_facts);
  section("📋 Action Items", result.action_items);
  section("💡 Important Details", result.important_details);

  return lines.join("\n").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    const resolved = await resolveTier(req);
    const body = await req.json().catch(() => ({}));
    const {
      transcript = "",
      contact_name = "",
      contact_company = "",
      meeting_date = new Date().toISOString().slice(0, 10),
    } = body as {
      transcript?: string;
      contact_name?: string;
      contact_company?: string;
      meeting_date?: string;
    };

    if (!transcript?.trim()) {
      throw new HttpError("transcript is required", 400);
    }

    // Long transcripts are the power-tier tool; short ones stay free.
    if (transcript.length > FREE_TRANSCRIPT_CHAR_LIMIT) {
      if (resolved.tier !== "power") {
        throw new HttpError(
          `This transcript is ${transcript.length.toLocaleString()} characters. The free engine handles up to ${FREE_TRANSCRIPT_CHAR_LIMIT.toLocaleString()} — add your own API key under Settings → AI engine to process full-length transcripts, or paste a shorter excerpt.`,
          402,
          {
            tool: "meeting-transcripts",
            tier: resolved.tier,
            limit: FREE_TRANSCRIPT_CHAR_LIMIT,
            length: transcript.length,
          },
        );
      }
      requirePower(resolved, "meeting-transcripts");
    }

    const result = await callLLM(resolved.creds, {
      prompt: buildPrompt(transcript, contact_name, contact_company, meeting_date),
      maxTokens: 8000,
      json: true,
    });

    const parsed = parseJsonObject<ParsedResult>(result.text);

    return json({
      suggested_title: parsed.suggested_title ?? "",
      fun_facts: parsed.fun_facts ?? [],
      action_items: parsed.action_items ?? [],
      important_details: parsed.important_details ?? [],
      formatted_notes: formatNotesFromResult(parsed, meeting_date),
      model: result.model,
      tier: resolved.tier,
    });
  } catch (e) {
    return errorResponse(e);
  }
});
