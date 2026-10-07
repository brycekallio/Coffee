// Backfill profiles.resume_text for profiles that already have a resume_url.
// Mirrors src/lib/utils.ts resumeStoragePath() + src/lib/resumeUtils.ts extractPdfText().
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import dotenv from "dotenv";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
dotenv.config({ path: `${ROOT}/.env.local`, quiet: true });

const DRY = process.argv.includes("--dry");

// Same normalization as src/lib/utils.ts
function resumeStoragePath(value) {
  const marker = "/resumes/";
  const idx = value.indexOf(marker);
  return idx === -1 ? value : value.slice(idx + marker.length);
}

async function extractPdfText(data) {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
    }
  } finally {
    await pdf.destroy();
  }
  return pages.join("\n\n");
}

const admin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

console.log("pdfjs API version:", pdfjsLib.version);

const { data: profiles, error } = await admin
  .from("profiles")
  .select("id, resume_url, resume_text")
  .not("resume_url", "is", null);
if (error) throw error;

console.log(`profiles with resume_url: ${profiles.length}`);

let ok = 0, failed = 0;
for (const p of profiles) {
  const shape = /^https?:\/\//i.test(p.resume_url) ? "legacy-public-url" : "bare-path";
  const path = resumeStoragePath(p.resume_url);
  try {
    const { data: blob, error: dlErr } = await admin.storage.from("resumes").download(path);
    if (dlErr) throw dlErr;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const byteLen = bytes.length;
    const text = await extractPdfText(bytes);
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    if (!text.trim()) throw new Error("parsed but empty text layer (scanned/image PDF?)");

    if (!DRY) {
      const { error: upErr } = await admin
        .from("profiles")
        .update({ resume_text: text })
        .eq("id", p.id);
      if (upErr) throw upErr;
    }
    ok++;
    console.log(
      `  OK  ${p.id.slice(0, 8)}  shape=${shape}  bytes=${byteLen}  chars=${text.length}  words=${words}${DRY ? "  (dry-run, not written)" : "  -> resume_text written"}`
    );
  } catch (e) {
    failed++;
    console.log(`  FAIL ${p.id.slice(0, 8)}  shape=${shape}  path=${path}  ${e.message}`);
  }
}
console.log(`\nparsed ok: ${ok}, failed: ${failed}`);
