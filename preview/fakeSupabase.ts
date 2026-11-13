// Stand-in for src/lib/supabase.ts in the preview harness (vite.preview.config.ts swaps it
// in). It is the same in-memory client the public /demo uses, but writable so the harness
// can be poked at freely.
import { createDemoClient } from "../src/demo/demoClient";
import * as seed from "../src/demo/sampleData";

// "?google=1" signs the sample student into a pretend Google account, to see the connected
// screens (e.g. Schedule follow-up -> Add to Google Calendar). The canned calendar answers success.
if (new URLSearchParams(window.location.search).has("google")) {
  for (const p of seed.profiles) Object.assign(p, { google_connected: true });
}

export const supabaseMisconfigured = false;
export const supabase = createDemoClient({ readOnly: false });

// src/demo/boot.ts imports this from "@/lib/supabase"; the harness client above is already
// the in-memory one, so there is nothing to install. Exported only so the import resolves.
export function installDemoClient(): void {}
