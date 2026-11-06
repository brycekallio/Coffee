import type { TablesUpdate } from "@/lib/database.types";

/**
 * The profile columns to write after a resume upload. resume_text is ALWAYS written: a new
 * non-PDF (or a PDF that fails to parse) gets null, so the AI tools never score the text of
 * a resume the user already replaced.
 */
export async function resumeUploadValues(
  path: string,
  parsePdf: () => Promise<string>,
  onParseError: (e: unknown) => void = () => {},
): Promise<{ values: TablesUpdate<"profiles">; isPdf: boolean }> {
  const values: TablesUpdate<"profiles"> = { resume_url: path, resume_text: null };
  const isPdf = path.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    try {
      values.resume_text = await parsePdf();
    } catch (e) {
      onParseError(e);
    }
  }
  return { values, isPdf };
}
