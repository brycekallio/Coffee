import { describe, expect, it } from "vitest";
import { ensureUrl, errorMessage, formatDateLabel, initialsFromName, resumeStoragePath } from "./utils";

describe("initialsFromName", () => {
  it("takes first and last initials", () => {
    expect(initialsFromName("Ada Byron Lovelace")).toBe("AL");
  });
  it("uses two letters of a single name", () => {
    expect(initialsFromName("cher")).toBe("CH");
  });
  it("falls back to U for an empty name", () => {
    expect(initialsFromName("   ")).toBe("U");
  });
});

describe("resumeStoragePath", () => {
  const path = "e659a23b-42ca-49bb-ba5c-8578c07cf89f/resume.pdf";

  it("passes a bare object path through unchanged", () => {
    expect(resumeStoragePath(path)).toBe(path);
  });
  it("strips a legacy public URL down to the object path", () => {
    const legacy = `https://ypyvkqysnowgegcjydnd.supabase.co/storage/v1/object/public/resumes/${path}`;
    expect(resumeStoragePath(legacy)).toBe(path);
  });
});

describe("ensureUrl", () => {
  it("adds https to a bare host", () => {
    expect(ensureUrl("linkedin.com/in/x")).toBe("https://linkedin.com/in/x");
  });
  it("leaves an explicit scheme alone", () => {
    expect(ensureUrl("http://example.com")).toBe("http://example.com");
  });
});

describe("formatDateLabel", () => {
  it("formats an ISO date as a local calendar date, not shifted by timezone", () => {
    // new Date("2026-01-01") is UTC midnight and renders as Dec 31 west of UTC.
    expect(formatDateLabel("2026-01-01")).toContain("2026");
    expect(formatDateLabel("2026-01-01")).toMatch(/Jan/);
  });
  it("returns unparseable input unchanged", () => {
    expect(formatDateLabel("someday")).toBe("someday");
  });
});

describe("errorMessage", () => {
  it("reads message from an Error", () => {
    expect(errorMessage(new Error("boom"), "fallback")).toBe("boom");
  });
  it("reads error_description from a Supabase auth-style error", () => {
    expect(errorMessage({ error_description: "bad token" }, "fallback")).toBe("bad token");
  });
  it("falls back for an empty message, a string, or nothing", () => {
    expect(errorMessage(new Error(""), "fallback")).toBe("fallback");
    expect(errorMessage("oops", "fallback")).toBe("fallback");
    expect(errorMessage(undefined, "fallback")).toBe("fallback");
  });
});
