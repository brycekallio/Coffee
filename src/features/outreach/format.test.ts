import { describe, expect, it } from "vitest";
import { buildMailto, failureLabel, movedOnMessage } from "./format";

describe("buildMailto", () => {
  it("carries the message exactly, with no tracking markup appended (H1)", () => {
    const message = "Hi Priya,\n\nThanks for the chat.\n\nMaya";
    const href = buildMailto("priya@example.com", "Follow up", message);
    const q = new URL(href);
    expect(q.protocol).toBe("mailto:");
    expect(decodeURIComponent(href.split("body=")[1])).toBe(message);
    expect(href).not.toMatch(/img|tracker|<|%3C/i);
  });
});

describe("failureLabel", () => {
  it("shows the stored reason, and rewrites the old Gmail one", () => {
    expect(failureLabel({ failure_reason: "Not sent: contact not found" })).toBe("Not sent: contact not found");
    expect(failureLabel({ failure_reason: "Gmail is not connected" })).toBe("Not sent: connect Gmail in Settings");
    expect(failureLabel({ failure_reason: null })).toBe("Not sent");
  });

  it("maps reasons written by the old cron", () => {
    expect(failureLabel({ failure_reason: "Google access was revoked; reconnect Gmail" }))
      .toBe("Not sent: Google access was revoked, reconnect Gmail in Settings");
    expect(failureLabel({ failure_reason: "Gmail refused the message (403)" })).toBe("Not sent: Gmail refused it (403)");
    expect(failureLabel({ failure_reason: "Gmail refused the message (403): {\"error\":1}" })).toBe("Not sent: Gmail refused it (403)");
    expect(failureLabel({ failure_reason: "Contact has no email address" })).toBe("Not sent: this contact has no email address");
  });

  it("prefixes and truncates unknown reasons", () => {
    expect(failureLabel({ failure_reason: "boom" })).toBe("Not sent: boom");
    expect(failureLabel({ failure_reason: "x".repeat(300) })).toHaveLength(120);
  });
});

describe("movedOnMessage", () => {
  it("says the right thing for each status", () => {
    expect(movedOnMessage("sent")).toBe("This was already sent");
    expect(movedOnMessage("opened")).toBe("This was already sent");
    expect(movedOnMessage("sending")).toBe("This is sending now");
    expect(movedOnMessage("failed")).toBe("This wasn't sent, see Not sent");
    expect(movedOnMessage("missed")).toBe("This wasn't sent, see Not sent");
  });
});
