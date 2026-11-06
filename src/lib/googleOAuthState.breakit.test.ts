// Break-it pass on the Google OAuth `state` and the callback (ticket C, 2026-11-06).
import { describe, expect, it, vi } from "vitest";
import { handleGoogleCallback } from "@/features/profile/googleCallback";
import { consumeOAuthState, newOAuthState, OAUTH_STATE_MAX_AGE_MS } from "./googleOAuthState";

function memStore() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("break-it: OAuth state", () => {
  it("cross-user: state made while A was signed in is refused once B is signed in (same tab)", () => {
    const store = memStore();
    const s = newOAuthState("user-a", store);
    expect(consumeOAuthState(s, "user-b", store)).toBe(false);
  });

  it("the same user with the same state is accepted", () => {
    const store = memStore();
    const s = newOAuthState("user-a", store);
    expect(consumeOAuthState(s, "user-a", store)).toBe(true);
  });

  it("stale: a state older than the limit is refused", () => {
    const store = memStore();
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const s = newOAuthState("user-a", store);
    now.mockReturnValue(1_000_000 + OAUTH_STATE_MAX_AGE_MS + 1);
    expect(consumeOAuthState(s, "user-a", store)).toBe(false);
    now.mockRestore();
  });

  it("forgery: a tampered stored record (attacker-planted JSON) never matches an empty state", () => {
    const store = memStore();
    store.setItem("coffee_google_oauth_state", JSON.stringify({ state: "", user: "user-a", at: Date.now() }));
    expect(consumeOAuthState("", "user-a", store)).toBe(false);
  });

  it("garbage in storage is refused, not thrown", () => {
    const store = memStore();
    store.setItem("coffee_google_oauth_state", "{nope");
    expect(consumeOAuthState("{nope", "user-a", store)).toBe(false);
  });

  it("the state sent to Google does not reveal the user id", () => {
    const s = newOAuthState("user_2abcSECRETID", memStore());
    expect(s).not.toContain("user_2abc");
  });

  it("callback for the wrong user never calls the exchange", async () => {
    const store = memStore();
    const s = newOAuthState("user-a", store);
    const ex = vi.fn(async () => ({ error: null, data: { gmail_send: true, calendar: true } }));
    const out = await handleGoogleCallback(`?code=c&state=${s}`, "https://app", ex, "user-b", store);
    expect(out.kind).toBe("rejected");
    expect(ex).not.toHaveBeenCalled();
  });

  it("an empty/odd exchange reply is NOT read as 'sending on' (fail closed)", async () => {
    const store = memStore();
    const s = newOAuthState("u", store);
    const out = await handleGoogleCallback(`?code=c&state=${s}`, "https://app", async () => ({ error: null, data: null }), "u", store);
    expect(out).toEqual({ kind: "connected", gmailSend: false, calendar: false });
  });
});
