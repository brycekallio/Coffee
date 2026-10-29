// In-memory stand-in for src/lib/supabase.ts, used only by the preview harness
// (vite.preview.config.ts swaps it in). Implements the slice of the supabase-js query
// builder Coffee uses, over the sample data, so the real app code runs unchanged.
import * as seed from "./sampleData";

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {
  contacts: structuredClone(seed.contacts),
  contact_meetings: structuredClone(seed.contact_meetings),
  applications: structuredClone(seed.applications),
  scheduled_outreach: structuredClone(seed.scheduled_outreach),
  watchlist_targets: structuredClone(seed.watchlist_targets),
  profiles: structuredClone(seed.profiles),
};

const latency = () => new Promise((r) => setTimeout(r, 120));
let nextId = 9000;
const newId = () => `00000000-0000-4000-9000-${String(++nextId).padStart(12, "0")}`;

type Filter = (r: Row) => boolean;

class Query implements PromiseLike<{ data: unknown; error: null }> {
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private returning = false;
  private mode: "many" | "single" | "maybe" = "many";

  constructor(private table: string) {
    db[table] ??= [];
  }

  select() { if (this.op !== "select") this.returning = true; return this; }
  insert(v: Row | Row[]) { this.op = "insert"; this.payload = v; return this; }
  update(v: Row) { this.op = "update"; this.payload = v; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  is(c: string, v: unknown) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  lte(c: string, v: string) { this.filters.push((r) => String(r[c]) <= v); return this; }
  gte(c: string, v: string) { this.filters.push((r) => String(r[c]) >= v); return this; }
  order(col: string, o: { ascending?: boolean } = {}) { this.orders.push({ col, asc: o.ascending ?? true }); return this; }
  limit() { return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  private run(): unknown {
    const rows = db[this.table];
    const match = (r: Row) => this.filters.every((f) => f(r));
    let out: Row[];
    if (this.op === "insert") {
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((v) => ({
        id: newId(),
        created_at: new Date().toISOString(),
        ...v,
      }));
      rows.unshift(...items);
      out = items;
    } else if (this.op === "update") {
      out = rows.filter(match);
      out.forEach((r) => Object.assign(r, this.payload));
    } else if (this.op === "delete") {
      out = rows.filter(match);
      db[this.table] = rows.filter((r) => !match(r));
    } else {
      out = rows.filter(match);
    }
    if (this.op !== "select" && !this.returning) return null;
    out = [...out].sort((a, b) => {
      for (const { col, asc } of this.orders) {
        const x = String(a[col] ?? ""), y = String(b[col] ?? "");
        if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
      }
      return 0;
    });
    const copy = structuredClone(out);
    if (this.mode === "single") return copy[0] ?? null;
    if (this.mode === "maybe") return copy[0] ?? null;
    return copy;
  }

  then<A, B>(ok?: ((v: { data: unknown; error: null }) => A) | null, bad?: ((e: unknown) => B) | null) {
    return latency().then(() => ({ data: this.run(), error: null as null })).then(ok, bad);
  }
}

const functions: Record<string, (body: Row) => unknown> = {
  "ai-settings": () => ({
    tier: "free",
    free_model: "nvidia/nemotron-3-super-120b-a12b:free",
    settings: null,
    provider_defaults: { openrouter: "anthropic/claude-sonnet-5-5", anthropic: "claude-sonnet-5-5" },
  }),
  "summarize-contact": () => ({
    summary:
      "Priya is a senior consultant in FTI's Data & Analytics practice who has met with you twice. She offered an intro to the DC recruiting lead and reviewed your resume; the open item is sending the revised version.",
  }),
  "score-jd": () => ({
    overall_score: 72,
    label: "Strong match",
    summary: "Your Python and SQL work maps directly to the analytics requirements; the role also wants client-facing experience you haven't shown yet.",
    strengths: ["Python data pipeline on SEC filings", "Tableau dashboards", "Excel modeling"],
    gaps: ["Client-facing work", "E-discovery or forensic tools"],
    sections: [
      { name: "Technical skills", score: 85, notes: "Python, SQL and Tableau all named in the posting." },
      { name: "Experience", score: 64, notes: "Research and nonprofit work; no consulting internship yet." },
      { name: "Education", score: 80, notes: "Finance with a Data Science minor fits the D&A track." },
    ],
  }),
  "process-meeting-notes": () => ({ suggested_title: "Coffee chat", formatted_notes: "Discussed the practice and next steps." }),
  "create-calendar-event": () => ({ ok: true }),
};

export const supabaseMisconfigured = false;

export const supabase = {
  from: (table: string) => new Query(table),
  rpc: async (name: string) => {
    await latency();
    return name === "link_clerk_identity" || name === "app_user_id"
      ? { data: seed.USER_ID, error: null }
      : { data: null, error: { message: `rpc ${name} not faked` } };
  },
  storage: {
    from: () => ({
      upload: async (path: string) => ({ data: { path }, error: null }),
      createSignedUrl: async () => ({ data: { signedUrl: "about:blank" }, error: null }),
    }),
  },
  functions: {
    invoke: async (name: string, opts: { body?: Row } = {}) => {
      await latency();
      const fn = functions[name];
      return fn ? { data: fn(opts.body ?? {}), error: null } : { data: null, error: { message: `${name} not faked` } };
    },
  },
};
