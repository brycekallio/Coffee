import { describe, expect, it } from "vitest";
import { buildMailto, failureLabel, movedOnMessage } from "./format";

/**
 * Break-it pass on the Outreach page helpers (2026-11-05). Passing tests are regression
 * guards; `it.fails` marks an attack that SUCCEEDED (see the comment above it).
 * The guarded writes themselves (status=eq.<expected>) are wire-tested in api.test.ts.
 */
describe("break-it: failure reasons shown on the page", () => {
  it("P1 legacy rows holding raw Google JSON (old cron) show only the code", () => {
    const raw = 'Gmail refused the message (403): {"error":{"code":403,"message":"Request had insufficient authentication scopes.","errors":[{"reason":"insufficientPermissions"}],"status":"PERMISSION_DENIED"}}';
    const label = failureLabel({ failure_reason: raw });
    expect(label).toBe("Not sent: Gmail refused it (403)");
    expect(label).not.toMatch(/[{}]/);
  });

  it("P2 every legacy reason the old cron wrote is rewritten, none passes through raw", () => {
    for (const r of ["Gmail is not connected", "Google access was revoked; reconnect Gmail", "Contact has no email address"]) {
      expect(failureLabel({ failure_reason: r })).toMatch(/^Not sent: /);
      expect(failureLabel({ failure_reason: r })).not.toBe(`Not sent: ${r}`);
    }
  });

  it("P3 an unknown huge reason is capped, blank or null reads 'Not sent'", () => {
    expect(failureLabel({ failure_reason: "z".repeat(10_000) }).length).toBeLessThanOrEqual(120);
    expect(failureLabel({ failure_reason: "   " })).toBe("Not sent");
    expect(failureLabel({ failure_reason: null })).toBe("Not sent");
  });

  it("P4 an unknown status (no CHECK on the column) gets a neutral message, not a crash", () => {
    expect(movedOnMessage("weird")).toBe("This changed. Refreshed");
    expect(movedOnMessage("")).toBe("This changed. Refreshed");
  });
});

describe("break-it: mailto hand-off", () => {
  it("P5 subject and body cannot inject extra mailto fields", () => {
    const m = buildMailto("a@x.com", "Hi&bcc=evil@y.com", "Body\n&cc=evil@y.com");
    const q = new URL(m).searchParams;
    expect(q.get("bcc")).toBeNull();
    expect(q.get("cc")).toBeNull();
    expect(q.get("body")).toBe("Body\n&cc=evil@y.com");
  });

  // SUCCEEDED (Low). The recipient is not encoded, so a contact email such as
  // "a@x.com?bcc=evil@y.com&" adds a Bcc to the draft. The user sees the draft in their
  // mail client before sending, and only they can write their contacts, so it is low.
  // Fix: encodeURIComponent(to) or reject addresses with ?, &, comma or whitespace.
  it("P6 a contact email cannot add a bcc to the mailto draft", () => {
    const m = buildMailto("a@x.com?bcc=evil@y.com&", "Hi", "Body");
    expect(new URL(m).searchParams.get("bcc")).toBeNull();
  });
});
