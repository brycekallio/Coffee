// The demo's database: an in-memory stand-in for the supabase-js client, over the sample
// data, implementing just the slice of the query builder Coffee uses so the real app code
// runs unchanged. It never touches the network.
//
// Two users: the public /demo builds it read-only (every write comes back as an error with
// DEMO_READ_ONLY_MESSAGE, which the app's own error toasts then show); the local preview
// harness (npm run preview:ui) builds it writable.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { DEMO_READ_ONLY_MESSAGE } from "./mode";
import { DEMO_QUESTIONS, DEMO_REVIEW } from "./demoResumeReview";
import * as seed from "./sampleData";

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;
type Db = Record<string, Row[]>;

export interface DemoClientOptions {
  /** Reject every insert/update/delete/upload. True for the public demo. */
  readOnly: boolean;
}

const latency = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const readOnlyError = () => ({ message: DEMO_READ_ONLY_MESSAGE, code: "DEMO_READ_ONLY" });

// Column defaults the real database applies on insert (bulk-select columns), so a row written
// in the writable preview has the same shape as one read back from Postgres.
const INSERT_DEFAULTS: Record<string, Row> = {
  contacts: { starred: false, tags: [], status: "to_contact" },
  watchlist_targets: { starred: false, tags: [] },
};

let nextId = 9000;
const newId = () => `00000000-0000-4000-9000-${String(++nextId).padStart(12, "0")}`;

type QueryResult = { data: unknown; error: { message: string } | null };

class Query implements PromiseLike<QueryResult> {
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private returning = false;
  private mode: "many" | "single" | "maybe" = "many";
  private window: [number, number] | null = null;

  constructor(private db: Db, private table: string, private readOnly: boolean) {
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
  range(from: number, to: number) { this.window = [from, to]; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  private run(): unknown {
    const rows = this.db[this.table];
    const match = (r: Row) => this.filters.every((f) => f(r));
    let out: Row[];
    if (this.op === "insert") {
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((v) => ({
        id: newId(),
        created_at: new Date().toISOString(),
        ...structuredClone(INSERT_DEFAULTS[this.table] ?? {}),
        ...v,
      }));
      rows.unshift(...items);
      out = items;
    } else if (this.op === "update") {
      out = rows.filter(match);
      out.forEach((r) => Object.assign(r, this.payload));
    } else if (this.op === "delete") {
      out = rows.filter(match);
      this.db[this.table] = rows.filter((r) => !match(r));
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
    if (this.window) out = out.slice(this.window[0], this.window[1] + 1);
    const copy = structuredClone(out);
    if (this.mode === "single" || this.mode === "maybe") return copy[0] ?? null;
    return copy;
  }

  then<A = QueryResult, B = never>(
    ok?: ((v: QueryResult) => A | PromiseLike<A>) | null,
    bad?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return latency()
      .then<QueryResult>(() =>
        this.op !== "select" && this.readOnly
          ? { data: null, error: readOnlyError() }
          : { data: this.run(), error: null },
      )
      .then(ok, bad);
  }
}

// ── Canned AI ───────────────────────────────────────────────────────────────────
// Edge Functions are never called in the demo. Each tool returns a fixed, believable
// result after a short delay so the loading states look real. Tools that only exist to
// save something (keys, calendar, transcripts) reject like any other write.

const AI_DELAY_MS = 1100;

const READ_ONLY_FUNCTIONS = new Set([
  "ai-settings:save",
  "ai-settings:test",
  "ai-settings:remove",
  "exchange-google-token",
  "google-disconnect",
  "create-calendar-event",
  "process-meeting-notes",
]);

const canned: Record<string, (body: Row) => unknown> = {
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
  "review-resume": (body) =>
    body.mode === "review"
      ? { mode: "review", review: DEMO_REVIEW, tier: "free", model: "nvidia/nemotron-3-super-120b-a12b:free" }
      : { mode: "questions", questions: DEMO_QUESTIONS, tier: "free", model: "nvidia/nemotron-3-super-120b-a12b:free" },
  "adjust-resume": (body) => ({
    model: "nvidia/nemotron-3-super-120b-a12b:free",
    tier: "free",
    suggestions:
      body.mode === "rewrite"
        ? "MAYA OKAFOR\nB.S. Business Administration (Finance), Data Science minor — University of Colorado Boulder, 2027\n\nEXPERIENCE\nResearch Assistant, Leeds Finance Dept — Built a Python pipeline that cleans and normalizes 40,000 SEC filings for faculty research.\nAnalyst Intern, Boulder Community Foundation — Automated grant reporting with Tableau dashboards used by the board.\n\nSKILLS\nPython, SQL, Excel modeling (DCF, LBO), Tableau"
        : "• Lead with the Python/SQL pipeline project; the posting names both.\n• Add the words \"stakeholder reporting\" to the Foundation internship.\n• Move coursework below experience.\n• Quantify the dashboard work (how many board members, how often).",
  }),
  // Only reachable in the writable preview harness (the public demo rejects it as a write above).
  "create-calendar-event": () => ({ success: true }),
  // Obviously fake person and link (DESIGN.md: never a URL that could be a real profile).
  "fill-contact-from-text": () => ({
    tier: "free",
    model: "nvidia/nemotron-3-super-120b-a12b:free",
    fields: {
      first_name: "Sam",
      last_name: "Rivera",
      company: "Northgate Capital (demo)",
      title: "Associate",
      email: "",
      phone: "",
      linkedin_url: "https://www.linkedin.com/in/demo-sam-rivera",
    },
  }),
  "personalize-outreach": () => ({
    model: "nvidia/nemotron-3-super-120b-a12b:free",
    message:
      "Hi Priya, thank you again for walking me through the Data & Analytics practice. Your point about analysts getting client exposure in year one stuck with me, and I've attached my updated resume with the SEC-filings pipeline up top. If you have 15 minutes in the next two weeks, I'd love to hear how you'd approach the recruiting timeline.",
  }),
};

function invokeFunction(name: string, body: Row, readOnly: boolean) {
  const action = typeof body.action === "string" ? `${name}:${body.action}` : name;
  if (readOnly && (READ_ONLY_FUNCTIONS.has(name) || READ_ONLY_FUNCTIONS.has(action))) {
    return { data: null, error: readOnlyError() };
  }
  const fn = canned[name];
  return fn ? { data: fn(body), error: null } : { data: null, error: { message: `${name} is not part of the demo` } };
}

/**
 * Builds the demo client. Typed as a real SupabaseClient so it drops into
 * `installDemoClient`; only the surface Coffee uses exists (from, rpc, storage, functions),
 * and `.auth` is absent exactly as it is on the real client.
 */
export function createDemoClient({ readOnly }: DemoClientOptions): SupabaseClient<Database> {
  const db: Db = {
    contacts: structuredClone(seed.contacts),
    contact_meetings: structuredClone(seed.contact_meetings),
    applications: structuredClone(seed.applications),
    scheduled_outreach: structuredClone(seed.scheduled_outreach),
    watchlist_targets: structuredClone(seed.watchlist_targets),
    profiles: structuredClone(seed.profiles),
  };

  const client = {
    from: (table: string) => new Query(db, table, readOnly),
    rpc: async (name: string) => {
      await latency();
      return name === "link_clerk_identity" || name === "app_user_id"
        ? { data: seed.USER_ID, error: null }
        : { data: null, error: { message: `rpc ${name} is not part of the demo` } };
    },
    storage: {
      from: () => ({
        upload: async (path: string) => {
          await latency();
          return readOnly ? { data: null, error: readOnlyError() } : { data: { path }, error: null };
        },
        createSignedUrl: async () => {
          await latency();
          return { data: null, error: { message: "Resume files aren't stored in the demo." } };
        },
      }),
    },
    functions: {
      invoke: async (name: string, opts: { body?: Row } = {}) => {
        await latency(AI_DELAY_MS);
        return invokeFunction(name, opts.body ?? {}, readOnly);
      },
    },
  };
  return client as unknown as SupabaseClient<Database>;
}
