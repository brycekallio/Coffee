import { beforeEach, describe, expect, it, vi } from "vitest";

// tier.ts runs on Deno: it reads secrets from Deno.env and talks to Supabase twice per
// request — once as the caller (rpc app_user_id) and once as the service role
// (user_ai_settings). Both are faked here so tier resolution is tested in isolation.
const env = new Map<string, string>();
vi.stubGlobal("Deno", { env: { get: (k: string) => env.get(k) } });

const db = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  settings: null as Record<string, unknown> | null,
  settingsError: null as { message: string } | null,
}));

vi.mock("jsr:@supabase/supabase-js@2", () => ({
  createClient: () => ({
    rpc: async () => ({ data: db.userId, error: db.userId ? null : { message: "no" } }),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: db.settings, error: db.settingsError }),
        }),
      }),
    }),
  }),
}));

const { resolveTier, requirePower, HttpError } = await import("./tier.ts");
const { FREE_MODEL, FREE_MODEL_CHAIN } = await import("./llm.ts");

const authed = () => new Request("https://x", { headers: { Authorization: "Bearer t" } });

beforeEach(() => {
  env.clear();
  env.set("SUPABASE_URL", "https://example.supabase.co");
  env.set("SUPABASE_ANON_KEY", "anon");
  env.set("SUPABASE_SERVICE_ROLE_KEY", "service");
  env.set("OPENROUTER_API_KEY", "shared-key");
  db.userId = "user-1";
  db.settings = null;
  db.settingsError = null;
});

describe("resolveTier", () => {
  it("rejects a request with no Authorization header before touching the database", async () => {
    await expect(resolveTier(new Request("https://x"))).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a token Supabase can't map to a user", async () => {
    db.userId = null;
    await expect(resolveTier(authed())).rejects.toMatchObject({ status: 401 });
  });

  it("puts a user with no saved key on the free tier, with the fallback chain", async () => {
    const r = await resolveTier(authed());
    expect(r.tier).toBe("free");
    expect(r.userId).toBe("user-1");
    expect(r.creds).toMatchObject({ provider: "openrouter", model: FREE_MODEL, apiKey: "shared-key" });
    expect(r.creds.fallbacks).toEqual(FREE_MODEL_CHAIN.slice(1));
  });

  it("puts a user with a saved key on the power tier, using their key and model", async () => {
    db.settings = { provider: "anthropic", model: "claude-sonnet-5-5", api_key: "byo" };
    const r = await resolveTier(authed());
    expect(r.tier).toBe("power");
    expect(r.creds).toMatchObject({ provider: "anthropic", model: "claude-sonnet-5-5", apiKey: "byo" });
    expect(r.creds.fallbacks).toBeUndefined();
  });

  it("treats a saved row with an empty key as free tier", async () => {
    db.settings = { provider: "openrouter", model: "x", api_key: null };
    expect((await resolveTier(authed())).tier).toBe("free");
  });

  it("degrades to free tier when the settings read fails, rather than erroring", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.settingsError = { message: "boom" };
    expect((await resolveTier(authed())).tier).toBe("free");
  });

  it("is a 500, not a silent failure, when the shared free key is missing", async () => {
    env.delete("OPENROUTER_API_KEY");
    await expect(resolveTier(authed())).rejects.toMatchObject({ status: 500 });
  });
});

describe("requirePower", () => {
  it("throws 402 for a free-tier caller, which the client turns into the upsell", async () => {
    const r = await resolveTier(authed());
    let err: unknown;
    try {
      requirePower(r, "resume-rewrite");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status: 402, extra: { tool: "resume-rewrite", tier: "free" } });
  });

  it("lets a power-tier caller through", async () => {
    db.settings = { provider: "openrouter", model: "m", api_key: "byo" };
    const r = await resolveTier(authed());
    expect(() => requirePower(r, "resume-rewrite")).not.toThrow();
  });
});

describe("POWER_TOOLS", () => {
  it("matches the client's list, so every gated tool has an upsell and vice versa", async () => {
    vi.doMock("@/lib/supabase", () => ({ supabase: {} }));
    const client = await import("../../../src/features/ai/client");
    const { POWER_TOOLS } = await import("./tier.ts");
    expect(client.POWER_TOOLS.map((t: { id: string }) => t.id).sort()).toEqual([...POWER_TOOLS].sort());
  });
});
