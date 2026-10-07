import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { errorResponse, json, preflight } from "../_shared/http.ts";
import { HttpError, resolveTier } from "../_shared/tier.ts";
import { callLLM } from "../_shared/llm.ts";

// Short "who is this person" brief before reaching out. Available on every tier.
//
// Deploy: supabase functions deploy summarize-contact --project-ref ypyvkqysnowgegcjydnd

interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
}

interface Meeting {
  id: string;
  meeting_date: string;
  title: string | null;
  notes: string | null;
}

interface RequestBody {
  contact?: Contact;
  meetings?: Meeting[];
}

function buildPrompt(contact: Contact, meetings: Meeting[]): string {
  const contactName =
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unknown";

  const contactInfo = [
    `Name: ${contactName}`,
    contact.title && `Title: ${contact.title}`,
    contact.company && `Company: ${contact.company}`,
    contact.email && `Email: ${contact.email}`,
    contact.linkedin_url && `LinkedIn: ${contact.linkedin_url}`,
  ]
    .filter(Boolean)
    .join("\n");

  const meetingsSummary = meetings.length > 0
    ? `Recent meetings:\n${
      meetings
        .slice()
        .sort(
          (a, b) =>
            new Date(b.meeting_date).getTime() - new Date(a.meeting_date).getTime(),
        )
        .slice(0, 5)
        .map(
          (m) =>
            `- ${m.meeting_date}: ${m.title || "Meeting"}\n  Notes: ${
              m.notes || "No notes"
            }`,
        )
        .join("\n")
    }`
    : "No meetings recorded yet.";

  return `Based on the following contact information and meeting history, write a concise 2-3 sentence summary of who this person is and what's important to know before reaching out. Focus on their role, company, and any key takeaways from meetings.

Contact Information:
${contactInfo}

${meetingsSummary}

Write the summary in a conversational, friendly tone. Keep it brief and actionable. Output the summary text only — no preamble, no headings.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  try {
    if (req.method !== "POST") {
      throw new HttpError("Method not allowed", 405);
    }

    const resolved = await resolveTier(req);
    const body: RequestBody = await req.json().catch(() => ({}));

    if (!body.contact) {
      throw new HttpError("Contact data is required", 400);
    }

    const result = await callLLM(resolved.creds, {
      prompt: buildPrompt(body.contact, body.meetings ?? []),
      // The summary is 2–3 sentences, but reasoning models think first — hence the gap
      // between the visible answer and the budget.
      maxTokens: 2000,
    });

    return json({
      summary: result.text,
      model: result.model,
      tier: resolved.tier,
    });
  } catch (e) {
    return errorResponse(e);
  }
});
