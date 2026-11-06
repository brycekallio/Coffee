import { describe, it, expect } from "vitest";
import { exchangeAndStore } from "./exchange";
import { handleGoogleCallback } from "../../../src/features/profile/googleCallback";

describe("reconnect edge cases", () => {
  it("no refresh_token: reports only what was saved, never a grant that was not persisted", async () => {
    let saved: Record<string, unknown> = {};
    const service = { from: () => ({ update: (v: Record<string, unknown>) => { saved = v; return { eq: async () => ({ error: null }) }; } }) };
    const fetch = (async () => new Response(JSON.stringify({ access_token: "a", expires_in: 3600,
      scope: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.events" }))) as typeof globalThis.fetch;
    const out = await exchangeAndStore({ code: "c", redirectUri: "r", userId: "u", clientId: "i", clientSecret: "s" }, { fetch, service: service as never });
    expect(saved.google_gmail_send).toBeUndefined();
    expect(saved.google_connected).toBeUndefined();
    expect(out.body).toEqual({ success: true, gmail_send: false, calendar: false });
  });
  it("no refresh_token: reports the stored flags read back from the database (Codex 2026-11-06)", async () => {
    const persisted = { google_connected: true, google_gmail_send: true };
    const service = { from: () => ({ update: (v: Record<string, unknown>) => ({ eq: async () => { Object.assign(persisted, v); return { error: null }; } }) }) };
    const fetch = (async () => new Response(JSON.stringify({ access_token: "a", expires_in: 3600,
      scope: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.events" }))) as typeof globalThis.fetch;
    const out = await exchangeAndStore({ code: "c", redirectUri: "r", userId: "u", clientId: "i", clientSecret: "s" },
      { fetch, service: service as never, readFlags: async () => ({ ...persisted }) });
    expect(persisted).toMatchObject({ google_connected: true, google_gmail_send: true });
    expect(out.body).toEqual({ success: true, gmail_send: true, calendar: true });
  });
  it("no refresh_token and Google dropped gmail.send: stored flag turned off and reported off", async () => {
    const persisted = { google_connected: true, google_gmail_send: true };
    const service = { from: () => ({ update: (v: Record<string, unknown>) => ({ eq: async () => { Object.assign(persisted, v); return { error: null }; } }) }) };
    const fetch = (async () => new Response(JSON.stringify({ access_token: "a", expires_in: 3600,
      scope: "https://www.googleapis.com/auth/calendar.events" }))) as typeof globalThis.fetch;
    const out = await exchangeAndStore({ code: "c", redirectUri: "r", userId: "u", clientId: "i", clientSecret: "s" },
      { fetch, service: service as never, readFlags: async () => ({ ...persisted }) });
    expect(out.body).toEqual({ success: true, gmail_send: false, calendar: true });
  });
  it("user cancels at Google (error=access_denied + our state) is a cancel, not a forged link", async () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    m.set("coffee_google_oauth_state", JSON.stringify({ state: "s1", user: "u", at: Date.now() }));
    const out = await handleGoogleCallback("?error=access_denied&state=s1", "http://x", async () => ({ error: null }), "u", store);
    expect(out).toEqual({ kind: "notice", message: "Google connection cancelled." });
    expect(m.has("coffee_google_oauth_state")).toBe(false);
  });
  it("other Google errors with our state give the generic message", async () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    m.set("coffee_google_oauth_state", JSON.stringify({ state: "s1", user: "u", at: Date.now() }));
    const out = await handleGoogleCallback("?error=server_error&state=s1", "http://x", async () => ({ error: null }), "u", store);
    expect(out).toEqual({ kind: "notice", message: "Google didn't connect. Try again." });
  });
  it("error with a wrong state is still rejected", async () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    const out = await handleGoogleCallback("?error=access_denied&state=nope", "http://x", async () => ({ error: null }), "u", store);
    expect(out.kind).toBe("rejected");
  });
});
