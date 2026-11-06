/** A mailto: body is plain text, so the message goes through untouched. */
export function buildMailto(to: string, subject: string, message: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}

/** The reason shown under a row the cron could not send. Also rewrites reasons the old cron wrote. */
export function failureLabel(item: { failure_reason: string | null }): string {
  const r = item.failure_reason?.trim();
  if (!r) return "Not sent";
  if (r === "Gmail is not connected") return "Not sent: connect Gmail in Settings";
  if (r === "Google access was revoked; reconnect Gmail") {
    return "Not sent: Google access was revoked, reconnect Gmail in Settings";
  }
  const refused = r.match(/^Gmail refused the message \((\d+)\)/);
  if (refused) return `Not sent: Gmail refused it (${refused[1]})`;
  if (r === "Contact has no email address") return "Not sent: this contact has no email address";
  return (r.startsWith("Not sent") ? r : `Not sent: ${r}`).slice(0, 120);
}

/** What to tell the user when a guarded write matched nothing, from the row's current status. */
export function movedOnMessage(status: string | null): string {
  if (status === "sent" || status === "opened") return "This was already sent";
  if (status === "sending") return "This is sending now";
  if (status === "failed" || status === "missed") return "This wasn't sent, see Not sent";
  if (status === null) return "This was deleted";
  return "This changed. Refreshed";
}
