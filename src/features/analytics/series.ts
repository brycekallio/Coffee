export interface SeriesPoint {
  date: string; // YYYY-MM-DD in the user's local time zone
  added: number;
  cumulative: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Local-time YYYY-MM-DD for a Date. */
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * One point per local calendar day for the last `days` days ending on `today`.
 * `cumulative` counts every contact created up to that day, including ones
 * from before the window. Rows with null/invalid created_at are skipped.
 */
export function buildContactsSeries(
  contacts: ReadonlyArray<{ created_at?: string | null }>,
  today: Date = new Date(),
  days = 30,
): SeriesPoint[] {
  const byDay = new Map<string, number>();
  for (const c of contacts) {
    if (!c.created_at) continue;
    const t = new Date(c.created_at);
    if (Number.isNaN(t.getTime())) continue;
    const key = localDayKey(t);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    keys.push(localDayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)));
  }

  const first = keys[0];
  let cumulative = 0;
  for (const [key, n] of byDay) if (key < first) cumulative += n;

  return keys.map((date) => {
    const added = byDay.get(date) ?? 0;
    cumulative += added;
    return { date, added, cumulative };
  });
}

/** Top companies by application count; ties break by name (A to Z). */
export function topCompanies(
  applications: ReadonlyArray<{ company: string }>,
  limit = 10,
): Array<{ company: string; count: number }> {
  const counts = new Map<string, number>();
  for (const a of applications) counts.set(a.company, (counts.get(a.company) ?? 0) + 1);
  return [...counts]
    .map(([company, count]) => ({ company, count }))
    .sort((a, b) => b.count - a.count || (a.company < b.company ? -1 : a.company > b.company ? 1 : 0))
    .slice(0, limit);
}
