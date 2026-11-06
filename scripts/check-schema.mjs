// Compares src/lib/database.types.ts with the LIVE PostgREST schema (public anon key only).
// Network, so it is NOT part of `verify`. Run: npm run check:schema
// Exits 1 on drift (extra/missing tables or columns), 2 if the live schema can't be read.
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

for (const f of [".env.local", ".env"]) {
  const p = resolve(process.cwd(), f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf-8").split("\n")) {
    const t = line.trim();
    const i = t.indexOf("=");
    if (!t || t.startsWith("#") || i < 0) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Need VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (public anon key; never the service key).");
  process.exit(2);
}

/** { table: Set(columns) } from the generated Row types. */
export function parseTypes(src) {
  const tables = {};
  const start = src.indexOf("Tables: {");
  if (start < 0) throw new Error("No `Tables: {` block in database.types.ts");
  const body = src.slice(start);
  const re = /^ {6}(\w+): \{\s*\n\s*Row: \{\n([\s\S]*?)\n {8}\}/gm;
  for (const m of body.matchAll(re)) {
    tables[m[1]] = new Set([...m[2].matchAll(/^ {10}(\w+)\??:/gm)].map((c) => c[1]));
  }
  return tables;
}

/** { table: Set(columns) } from PostgREST's OpenAPI (swagger 2 `definitions`, or openapi 3 `components.schemas`). */
export function parseOpenApi(doc) {
  const defs = doc.definitions ?? doc.components?.schemas ?? {};
  const out = {};
  for (const [name, def] of Object.entries(defs)) out[name] = new Set(Object.keys(def.properties ?? {}));
  return out;
}

export function diff(local, live) {
  const problems = [];
  for (const t of Object.keys(local).sort()) {
    if (!live[t]) { problems.push(`table ${t}: in types, not in live schema`); continue; }
    for (const c of local[t]) if (!live[t].has(c)) problems.push(`${t}.${c}: in types, missing live (extra in types)`);
    for (const c of live[t]) if (!local[t].has(c)) problems.push(`${t}.${c}: live, missing in types`);
  }
  for (const t of Object.keys(live).sort()) {
    if (!local[t]) problems.push(`table ${t}: live, not in types`);
  }
  return problems;
}

/**
 * Fallback when the OpenAPI endpoint is closed to the anon key (Supabase now serves it to
 * service_role only): probe each typed column with `select=<col>&limit=0`. That finds columns
 * and tables the TYPES have but the live schema lacks. It cannot see live columns the types
 * lack; use the service-side `generate_typescript_types` to regenerate for that direction.
 */
async function probe(local) {
  const problems = [];
  const base = url.replace(/\/$/, "") + "/rest/v1/";
  const headers = { apikey: key, authorization: `Bearer ${key}` };
  for (const [t, cols] of Object.entries(local)) {
    const r0 = await fetch(`${base}${t}?select=*&limit=0`, { headers });
    if (r0.status === 404) { problems.push(`table ${t}: in types, not in live schema`); continue; }
    for (const c of cols) {
      const r = await fetch(`${base}${t}?select=${encodeURIComponent(c)}&limit=0`, { headers });
      if (r.ok) continue;
      const e = await r.json().catch(() => ({}));
      if (e.code === "42703") problems.push(`${t}.${c}: in types, missing live (extra in types)`);
      else if (r.status !== 401 && r.status !== 403) problems.push(`${t}.${c}: probe failed HTTP ${r.status} ${e.code ?? ""}`);
    }
  }
  return problems;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const local = parseTypes(readFileSync(resolve(process.cwd(), "src/lib/database.types.ts"), "utf-8"));
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/`, {
    headers: { apikey: key, authorization: `Bearer ${key}`, accept: "application/openapi+json" },
  });
  let problems;
  let mode = "OpenAPI (both directions)";
  if (res.ok) {
    problems = diff(local, parseOpenApi(await res.json()));
  } else if (res.status === 401 || res.status === 403) {
    mode = "column probe (types -> live only; OpenAPI is closed to the anon key)";
    problems = await probe(local);
  } else {
    console.error(`Could not read the live schema: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    process.exit(2);
  }
  if (problems.length) {
    console.error(`Schema drift via ${mode} (${problems.length}):\n` + problems.map((p) => "  - " + p).join("\n"));
    process.exit(1);
  }
  console.log(`Schema OK via ${mode}: ${Object.keys(local).length} tables match.`);
}
