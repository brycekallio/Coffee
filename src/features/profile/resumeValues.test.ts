import { describe, expect, it, vi } from "vitest";
import { resumeUploadValues } from "./resumeValues";

describe("resumeUploadValues (L2)", () => {
  it("non-PDF upload sets resume_text null and never parses", async () => {
    const parse = vi.fn(async () => "old text");
    const { values, isPdf } = await resumeUploadValues("u/resume.docx", parse);
    expect(values).toEqual({ resume_url: "u/resume.docx", resume_text: null });
    expect(isPdf).toBe(false);
    expect(parse).not.toHaveBeenCalled();
  });
  it("PDF stores the parsed text", async () => {
    expect((await resumeUploadValues("u/resume.pdf", async () => "hello")).values.resume_text).toBe("hello");
  });
  it("PDF that fails to parse clears stale text and reports the error", async () => {
    const err = vi.fn();
    const { values } = await resumeUploadValues("u/resume.pdf", async () => { throw new Error("bad"); }, err);
    expect(values.resume_text).toBeNull();
    expect(err).toHaveBeenCalled();
  });
});
