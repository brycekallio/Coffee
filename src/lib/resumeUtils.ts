import * as pdfjsLib from "pdfjs-dist";
import { supabase } from "./supabase";
// pdf.js refuses to run an API build against a mismatched worker build — getDocument()
// throws "The API version <x> does not match the Worker version <y>". This used to point
// at a hardcoded CDN worker (pdf.js 4.10.38) while package.json installed pdfjs-dist 5.x,
// so every parse threw and profiles.resume_text was never populated.
//
// Importing the worker out of the installed package with Vite's `?url` makes the worker
// version *be* the installed version: bump pdfjs-dist and the worker follows automatically.
// It is also bundled and served from our own origin, so parsing no longer depends on a CDN.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** Extracts the text layer from every page of an in-memory PDF. */
async function extractPdfText(data: Uint8Array): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: string[] = [];

  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item: any) => ("str" in item ? item.str : ""))
        .join(" ");
      pages.push(text);
    }
  } finally {
    await pdf.destroy();
  }

  return pages.join("\n\n");
}

export async function parsePdfToText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return extractPdfText(new Uint8Array(buffer));
}

/**
 * Downloads a PDF and extracts its text. Takes the bytes in one request rather than
 * letting pdf.js issue HTTP Range requests, which keeps it working against Supabase
 * signed URLs (the `resumes` bucket is private) without depending on range support.
 */
export async function parsePdfFromUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not download the resume (HTTP ${res.status}).`);
  }
  const buffer = await res.arrayBuffer();
  return extractPdfText(new Uint8Array(buffer));
}

export async function checkOllamaAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch("http://localhost:11434/api/tags", {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export async function getOllamaModels(): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch("http://localhost:11434/api/tags", {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map((m: any) => m.name as string);
  } catch {
    return [];
  }
}

/**
 * Default path for resume-vs-JD suggestions: the `adjust-resume` Edge Function, which
 * calls Claude server-side. This replaces adjustResumeWithOllama() as the primary route —
 * Ollama lives at localhost:11434, so it only ever worked on a machine running Ollama and
 * was dead for every invited user. Ollama is kept below as a local-only fallback.
 */
export async function adjustResumeWithClaude(
  resumeText: string,
  jobDescription: string
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("adjust-resume", {
    body: { resume_text: resumeText, job_description: jobDescription },
  });

  // A non-2xx Edge Function response surfaces as `error` with the body unread, so pull
  // the server's own message out of it rather than showing a bare "non-2xx status code".
  if (error) {
    let detail = error.message;
    const res = (error as { context?: Response }).context;
    if (res && typeof res.json === "function") {
      try {
        const body = await res.json();
        if (body?.error) detail = body.error;
      } catch {
        // keep the generic message
      }
    }
    throw new Error(detail);
  }
  if ((data as { error?: string })?.error) {
    throw new Error((data as { error: string }).error);
  }

  const suggestions = (data as { suggestions?: string })?.suggestions?.trim();
  if (!suggestions) {
    throw new Error("The server returned no suggestions.");
  }
  return suggestions;
}

/** Local-only fallback. Requires Ollama running at localhost:11434 on the user's machine. */
export async function adjustResumeWithOllama(
  resumeText: string,
  jobDescription: string,
  model: string
): Promise<string> {
  const prompt = `You are a resume optimization assistant. A student wants to tailor their resume for a specific job posting.

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

  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error: ${err}`);
  }

  const data = await res.json();
  return data.response;
}

export async function fetchLinkedInPreview(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const html = await res.text();
    const extract = (property: string): string | null => {
      const re = new RegExp(
        `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
        "i"
      );
      const match = html.match(re);
      if (match) return match[1];
      const re2 = new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
        "i"
      );
      const match2 = html.match(re2);
      return match2 ? match2[1] : null;
    };

    const title = extract("og:title");
    const description = extract("og:description");
    const parts = [title, description].filter(Boolean);
    return parts.length > 0 ? parts.join("\n") : null;
  } catch {
    return null;
  }
}

export async function personalizeOutreachWithOllama(
  resumeText: string | null,
  contactInfo: string,
  linkedInPreview: string | null,
  currentMessage: string,
  model: string
): Promise<string> {
  let context = "";
  if (resumeText) {
    context += `MY BACKGROUND (from resume):\n${resumeText}\n\n`;
  }
  context += `RECIPIENT INFO:\n${contactInfo}\n\n`;
  if (linkedInPreview) {
    context += `RECIPIENT'S LINKEDIN PROFILE:\n${linkedInPreview}\n\n`;
  }

  const prompt = `You are helping a student personalize a networking outreach message. Use the context below to make the message feel personal, specific, and genuine — not generic.

${context}DRAFT MESSAGE TO PERSONALIZE:
${currentMessage}

Rewrite the message to:
- Reference specific details about the recipient (their role, company, background from LinkedIn)
- Connect the sender's background/interests to the recipient's work where relevant
- Keep the same tone, intent, and approximate length as the draft
- Sound natural and human — not overly formal or robotic
- Replace any placeholder text like [Your Name] with appropriate references

Return ONLY the personalized message text, nothing else.`;

  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error: ${err}`);
  }

  const data = await res.json();
  return data.response;
}
