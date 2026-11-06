import { describe, expect, it, vi } from "vitest";
import { exchangeAndStore, GMAIL_SEND_SCOPE, grantedGmailSend } from "./exchange";

const input = { code: "c", redirectUri: "https://x/", userId: "u1", clientId: "id", clientSecret: "s" };
function svc(saved: Record<string, unknown>[]) {
  return { from: () => ({ update: (v: Record<string, unknown>) => ({ eq: async () => { saved.push(v); return { error: null }; } }) }) };
}
const google = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("exchange-google-token", () => {
  it("scope with gmail.send -> gmail_send true, flag set", async () => {
    const saved: Record<string, unknown>[] = [];
    const out = await exchangeAndStore(input, {
      fetch: google({ access_token: "A", refresh_token: "R", expires_in: 3600, scope: `openid https://www.googleapis.com/auth/calendar.events ${GMAIL_SEND_SCOPE}` }) as never,
      service: svc(saved),
    });
    expect(out).toEqual({ status: 200, body: { success: true, gmail_send: true, calendar: true } });
    expect(saved[0]).toMatchObject({ google_calendar_token: "A", google_calendar_refresh_token: "R", google_connected: true });
  });

  it("gmail.send not granted -> calendar still saved, gmail_send false so the UI can warn", async () => {
    const saved: Record<string, unknown>[] = [];
    const out = await exchangeAndStore(input, {
      fetch: google({ access_token: "A", refresh_token: "R", scope: "https://www.googleapis.com/auth/calendar.events" }) as never,
      service: svc(saved),
    });
    expect(out.body).toEqual({ success: true, gmail_send: false, calendar: true });
    expect(saved).toHaveLength(1);
    // Rule (owner, 2026-11-06): google_connected = Calendar linked, so a Calendar-only connect IS connected.
    expect(saved[0].google_connected).toBe(true);
    expect(saved[0].google_gmail_send).toBe(false);
  });

  it("does not allow auto-send when Gmail send was not granted", async () => {
    const saved: Record<string, unknown>[] = [];
    const out = await exchangeAndStore(input, {
      fetch: google({ access_token: "A", refresh_token: "R", scope: "https://www.googleapis.com/auth/calendar.events" }) as never,
      service: svc(saved),
    });
    expect(out.body).toEqual({ success: true, gmail_send: false, calendar: true });
    // Outreach auto-sends only on google_gmail_send; google_connected is Calendar alone.
    expect(saved[0].google_gmail_send).toBe(false);
  });

  it("no refresh token returned -> does not overwrite the saved one or the flag", async () => {
    const saved: Record<string, unknown>[] = [];
    await exchangeAndStore(input, {
      fetch: google({ access_token: "A", scope: `https://www.googleapis.com/auth/calendar.events ${GMAIL_SEND_SCOPE}` }) as never,
      service: svc(saved),
    });
    expect(saved[0]).not.toHaveProperty("google_calendar_refresh_token");
    expect(saved[0]).not.toHaveProperty("google_connected");
    expect(saved[0]).not.toHaveProperty("google_gmail_send");
  });

  it("Google rejects the code -> 400 and nothing saved", async () => {
    const saved: Record<string, unknown>[] = [];
    const out = await exchangeAndStore(input, { fetch: google({ error: "invalid_grant" }, 400) as never, service: svc(saved) });
    expect(out).toEqual({ status: 400, body: { error: "invalid_grant" } });
    expect(saved).toEqual([]);
  });

  it("grantedGmailSend handles missing scope", () => {
    expect(grantedGmailSend(undefined)).toBe(false);
    expect(grantedGmailSend("a gmail.send")).toBe(false);
  });
});
