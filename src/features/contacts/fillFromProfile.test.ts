import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke } } }));

const { fillFromProfileText, mergeIntoForm } = await import("./fillFromProfile");

const PROFILE = "Priya Raman\nSenior Consultant at FTI\nlinkedin.com/in/priya-demo\npriya@example.com";

/** What supabase-js hands back for a non-2xx Edge Function: error.context is the Response. */
const httpError = (status: number, body: unknown) => ({
  data: null,
  error: { message: "non-2xx", context: new Response(JSON.stringify(body), { status }) },
});

describe("fillFromProfileText", () => {
  beforeEach(() => invoke.mockReset());

  it("returns only the fields the AI found, cleaned again on this side", async () => {
    invoke.mockResolvedValue({
      data: { fields: { first_name: "Priya", last_name: "Raman", company: "<i>FTI</i>", title: "", email: "", phone: "", linkedin_url: "javascript:alert(1)" } },
      error: null,
    });
    const out = await fillFromProfileText(PROFILE);
    expect(out).toEqual({ kind: "ai", fields: { first_name: "Priya", last_name: "Raman", company: "FTI" } });
    expect(invoke).toHaveBeenCalledWith("fill-contact-from-text", { body: { text: PROFILE } });
  });

  it("degrades at the daily limit: says why, and still takes the link and email from the text", async () => {
    const message = "You've used today's 5 free AI requests. More arrive in about 5 hours.";
    invoke.mockResolvedValue(httpError(429, { error: message, reason: "free_daily_limit" }));
    const out = await fillFromProfileText(PROFILE);
    expect(out).toEqual({
      kind: "fallback",
      reason: "limit",
      message,
      fields: { linkedin_url: "https://www.linkedin.com/in/priya-demo", email: "priya@example.com" },
    });
  });

  it("falls back on a provider outage or an unreadable answer", async () => {
    invoke.mockResolvedValue(httpError(503, { error: "The free AI engine is unavailable right now." }));
    expect(await fillFromProfileText("Just some text with nothing obvious")).toMatchObject({ kind: "fallback", reason: "error", fields: {} });
    invoke.mockResolvedValue({ data: { fields: {} }, error: null });
    expect(await fillFromProfileText(PROFILE)).toMatchObject({ kind: "fallback", reason: "error" });
  });

  it("never throws: supabase-js reports a network failure as an error value", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("Failed to send a request to the Edge Function") });
    await expect(fillFromProfileText(PROFILE)).resolves.toMatchObject({ kind: "fallback", reason: "error" });
  });
});

describe("mergeIntoForm", () => {
  it("fills from the AI but never erases what the user typed", () => {
    const form = { first: "Typed", last: "", company: "Keep Co" };
    expect(mergeIntoForm(form, { first: "Priya", last: "Raman", company: "" })).toEqual({ first: "Priya", last: "Raman", company: "Keep Co" });
  });
});
