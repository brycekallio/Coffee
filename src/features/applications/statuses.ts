/** The one application-status vocabulary: form, board, table, analytics, demo data. */
export const APPLICATION_STATUSES = [
  "Networking",
  "Saved",
  "Applied",
  "Interviewing",
  "Offer",
  "Rejected",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Values older builds wrote to the database, mapped to the current words. */
const LEGACY: Record<string, ApplicationStatus> = {
  bookmarked: "Saved",
  interview: "Interviewing",
  accepted: "Offer",
};

/** Always returns a known status, so no row can vanish from the board or chart. */
export function normalizeStatus(raw: string | null | undefined): ApplicationStatus {
  const key = (raw ?? "").trim().toLowerCase();
  const current = APPLICATION_STATUSES.find((s) => s.toLowerCase() === key);
  return current ?? LEGACY[key] ?? "Applied";
}

export function countByStatus(apps: ReadonlyArray<{ status: string }>) {
  const counts = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<ApplicationStatus, number>;
  for (const a of apps) counts[normalizeStatus(a.status)]++;
  return APPLICATION_STATUSES.map((status) => ({ status, count: counts[status] }));
}
