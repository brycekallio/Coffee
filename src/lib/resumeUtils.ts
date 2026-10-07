import * as pdfjsLib from "pdfjs-dist";
import { invokeAi, type AiTier } from "@/features/ai/client";
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

/**
 * Resume-vs-JD tailoring via the `adjust-resume` Edge Function.
 *
 * `mode: "suggestions"` (the default) runs on the free open-weight engine for everyone.
 * `mode: "rewrite"` returns a full tailored resume and needs a power-tier key — it
 * throws PowerTierRequiredError when the user has not saved one.
 */
export async function adjustResume(
  resumeText: string,
  jobDescription: string,
  mode: "suggestions" | "rewrite" = "suggestions"
): Promise<{ suggestions: string; model: string; tier: AiTier }> {
  const data = await invokeAi<{
    suggestions?: string;
    model?: string;
    tier?: AiTier;
  }>("adjust-resume", {
    resume_text: resumeText,
    job_description: jobDescription,
    mode,
  });

  const suggestions = data.suggestions?.trim();
  if (!suggestions) {
    throw new Error("The server returned no suggestions.");
  }
  return {
    suggestions,
    model: data.model ?? "unknown",
    tier: data.tier ?? "free",
  };
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

/**
 * Rewrites a draft outreach message against the sender's resume and the recipient's
 * details, via the `personalize-outreach` Edge Function. Power tier only — throws
 * PowerTierRequiredError when the user has no API key saved.
 */
export async function personalizeOutreach(args: {
  resumeText: string | null;
  contactInfo: string;
  linkedInPreview: string | null;
  currentMessage: string;
}): Promise<{ message: string; model: string }> {
  const data = await invokeAi<{ message?: string; model?: string }>(
    "personalize-outreach",
    {
      resume_text: args.resumeText,
      contact_info: args.contactInfo,
      linkedin_preview: args.linkedInPreview,
      current_message: args.currentMessage,
    }
  );

  const message = data.message?.trim();
  if (!message) {
    throw new Error("The server returned an empty message.");
  }
  return { message, model: data.model ?? "unknown" };
}
