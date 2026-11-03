import { isDemoMode } from "@/demo/mode";
import * as pdfjsLib from "pdfjs-dist";
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
        .map((item) => ("str" in item ? item.str : ""))
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
  if (isDemoMode) throw new Error("Resume files aren't available in the demo.");
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not download the resume (HTTP ${res.status}).`);
  }
  const buffer = await res.arrayBuffer();
  return extractPdfText(new Uint8Array(buffer));
}
