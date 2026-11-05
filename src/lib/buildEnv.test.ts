import { describe, expect, it } from "vitest";
import { checkBuildEnv } from "../../vite.config";

describe("checkBuildEnv", () => {
  const ok = { VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_ANON_KEY: "anon", VITE_CLERK_PUBLISHABLE_KEY: "pk_live_abc" };

  it("passes with everything set", () => {
    expect(checkBuildEnv(ok)).toEqual({ errors: [], warnings: [] });
  });

  it("refuses an empty or blank Supabase URL or key", () => {
    expect(checkBuildEnv({ ...ok, VITE_SUPABASE_URL: "" }).errors).toHaveLength(1);
    expect(checkBuildEnv({ ...ok, VITE_SUPABASE_ANON_KEY: "  " }).errors).toHaveLength(1);
    expect(checkBuildEnv({}).errors).toHaveLength(2);
  });

  it("only warns about Clerk, because main.tsx has a committed fallback", () => {
    const r = checkBuildEnv({ ...ok, VITE_CLERK_PUBLISHABLE_KEY: "" });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(checkBuildEnv({ ...ok, VITE_CLERK_PUBLISHABLE_KEY: "pk_test_x" }).warnings).toHaveLength(1);
  });
});
