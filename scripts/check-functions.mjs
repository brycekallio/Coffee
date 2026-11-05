// Type-checks every Edge Function with Deno, the runtime they actually run on.
// Vitest and tsc cannot see Deno-only code (jsr: imports, Deno.* APIs).
// If deno is not installed this prints a loud warning and skips (exit 0); set REQUIRE_DENO=1
// to make a missing deno a failure instead.
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";

const dir = "supabase/functions";
const entries = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(`${dir}/${d.name}/index.ts`))
  .map((d) => `${dir}/${d.name}/index.ts`);

const probe = spawnSync("deno", ["--version"], { encoding: "utf8" });
if (probe.error || probe.status !== 0) {
  const msg = "check:functions SKIPPED: deno is not installed, so Edge Functions were NOT type-checked. Install it (brew install deno).";
  if (process.env.REQUIRE_DENO === "1") {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.warn(`WARNING: ${msg}`);
  process.exit(0);
}

const run = spawnSync("deno", ["check", "--config", `${dir}/deno.json`, ...entries], { stdio: "inherit" });
if (run.status !== 0) process.exit(run.status ?? 1);
console.log(`check:functions: ${entries.length} Edge Functions type-check clean.`);
