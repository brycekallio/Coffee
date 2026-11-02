// Stand-in for src/lib/supabase.ts in the preview harness (vite.preview.config.ts swaps it
// in). It is the same in-memory client the public /demo uses, but writable so the harness
// can be poked at freely.
import { createDemoClient } from "../src/demo/demoClient";

export const supabaseMisconfigured = false;
export const supabase = createDemoClient({ readOnly: false });
