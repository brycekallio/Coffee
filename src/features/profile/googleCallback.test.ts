import { describe, expect, it, vi } from "vitest";
import { newOAuthState } from "@/lib/googleOAuthState";
import { PROFILE_COLUMNS } from "./api";
import { handleGoogleCallback } from "./googleCallback";

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
const ok = () => vi.fn(async () => ({ error: null, data: { gmail_send: true, calendar: true } }));

describe("Google OAuth callback", () => {
  it("exact state match calls the exchange once", async () => {
    const store = memStore();
    const state = newOAuthState("u", store);
    const ex = ok();
    const out = await handleGoogleCallback(`?code=abc&state=${state}`, "https://app", ex, "u", store);
    expect(out).toEqual({ kind: "connected", gmailSend: true, calendar: true });
    expect(ex).toHaveBeenCalledWith({ code: "abc", redirect_uri: "https://app/" });
  });

  it("wrong state never calls the exchange (the old constant is rejected)", async () => {
    const store = memStore();
    newOAuthState("u", store);
    const ex = ok();
    expect((await handleGoogleCallback("?code=abc&state=gcal_connect", "https://app", ex, "u", store)).kind).toBe("rejected");
    expect(ex).not.toHaveBeenCalled();
  });

  it("missing state never calls the exchange", async () => {
    const store = memStore();
    newOAuthState("u", store);
    const ex = ok();
    expect((await handleGoogleCallback("?code=abc", "https://app", ex, "u", store)).kind).toBe("rejected");
    expect(ex).not.toHaveBeenCalled();
  });

  it("no stored state (link opened in another tab) never calls the exchange", async () => {
    const ex = ok();
    expect((await handleGoogleCallback("?code=abc&state=anything", "https://app", ex, "u", memStore())).kind).toBe("rejected");
    expect(ex).not.toHaveBeenCalled();
  });

  it("state is single-use: replaying the same link is rejected", async () => {
    const store = memStore();
    const state = newOAuthState("u", store);
    const ex = ok();
    await handleGoogleCallback(`?code=a&state=${state}`, "https://app", ex, "u", store);
    expect((await handleGoogleCallback(`?code=a&state=${state}`, "https://app", ex, "u", store)).kind).toBe("rejected");
    expect(ex).toHaveBeenCalledTimes(1);
  });

  it("a rejected attempt also clears the stored state", async () => {
    const store = memStore();
    const state = newOAuthState("u", store);
    const ex = ok();
    await handleGoogleCallback("?code=a&state=bad", "https://app", ex, "u", store);
    expect((await handleGoogleCallback(`?code=a&state=${state}`, "https://app", ex, "u", store)).kind).toBe("rejected");
  });

  it("surfaces gmail.send not granted", async () => {
    const store = memStore();
    const state = newOAuthState("u", store);
    const out = await handleGoogleCallback(`?code=a&state=${state}`, "https://app", async () => ({ error: null, data: { gmail_send: false, calendar: true } }), "u", store);
    expect(out).toEqual({ kind: "connected", gmailSend: false, calendar: true });
  });

  it("ignores URLs with no OAuth params", async () => {
    expect((await handleGoogleCallback("?tab=x", "https://app", ok(), "u", memStore())).kind).toBe("ignored");
  });
});

describe("profile columns", () => {
  it("never selects a Google token column", () => {
    expect(PROFILE_COLUMNS).not.toMatch(/google_calendar/);
    expect(PROFILE_COLUMNS).toContain("google_connected");
  });
});
