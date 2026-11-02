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
  // ai_free_usage, as consume_free_ai_request() keeps it: requests per user for today.
  usage: new Map<string, number>(),
  usageError: null as { message: string } | null,
  consumeCalls: [] as Array<{ p_user: string; p_limit: number }>,
}));

vi.mock("jsr:@supabase/supabase-js@2", () => ({
  createClient: () => ({
    rpc: async (fn: string, args?: { p_user: string; p_limit: number }) => {
      if (fn === "app_user_id") {
        return { data: db.userId, error: db.userId ? null : { message: "no" } };
      }
      if (fn === "consume_free_ai_request" && args) {
        // Same contract as the SQL: the new count, or null (and no write) past the limit.
        db.consumeCalls.push(args);
        if (db.usageError) return { data: null, error: db.usageError };
        const used = db.usage.get(args.p_user) ?? 0;
        if (args.p_limit <= 0 || used >= args.p_limit) return { data: null, error: null };
        db.usage.set(args.p_user, used + 1);
        return { data: used + 1, error: null };
      }
      throw new Error(`unexpected rpc ${fn}`);
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: db.settings, error: db.settingsError }),
        }),
      }),
    }),
  }),
}));

const { resolveTier, requirePower, HttpError, callModel, freeDailyLimit, resetPhrase } = await import("./tier.ts");
const { FREE_MODEL, FREE_MODEL_CHAIN } = await import("./llm.ts");

// The model itself: OpenRouter/Anthropic answer "ok" and record who paid for the call.
const llmCalls: string[] = [];
vi.stubGlobal("fetch", async (url: string, init: { headers: Record<string, string> }) => {
  llmCalls.push(init.headers.Authorization ?? init.headers["x-api-key"]);
  const body = String(url).includes("anthropic")
    ? { content: [{ type: "text", text: "ok" }], model: "m" }
    : { choices: [{ message: { content: "ok" } }], model: "m" };
  return new Response(JSON.stringify(body), { status: 200 });
});

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
  db.usage.clear();
  db.usageError = null;
  db.consumeCalls = [];
  llmCalls.length = 0;
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

describe("per-user free-tier cap", () => {
  const ask = { prompt: "hi", maxTokens: 10 };

  async function spendAs(userId: string, times: number) {
    db.userId = userId;
    const r = await resolveTier(authed());
    for (let i = 0; i < times; i++) await callModel(r, ask);
    return r;
  }

  async function refusal(promise: Promise<unknown>) {
    try {
      await promise;
    } catch (e) {
      return e as InstanceType<typeof HttpError>;
    }
    throw new Error("expected a refusal");
  }

  it("defaults to 10 free requests a day per user", () => {
    expect(freeDailyLimit()).toBe(10);
  });

  it("lets 10 through, then refuses the 11th with a friendly 429 before calling the model", async () => {
    const r = await spendAs("user-1", 10);
    expect(llmCalls).toHaveLength(10);

    const err = await refusal(callModel(r, ask));
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(429);
    expect(err.extra).toMatchObject({ reason: "free_daily_limit", limit: 10 });
    expect(err.message).toMatch(/today's 10 free AI requests/);
    expect(err.message).toMatch(/Settings → AI engine/);
    expect(llmCalls).toHaveLength(10); // the shared key was not spent on the refused call
  });

  it("counts each user separately, keyed on the server-resolved user id", async () => {
    await spendAs("user-1", 10);
    const r2 = await spendAs("user-2", 1);
    expect(r2.userId).toBe("user-2");
    expect(db.usage.get("user-2")).toBe(1);
    expect(db.consumeCalls.every((c) => c.p_user === "user-1" || c.p_user === "user-2")).toBe(true);
  });

  it("reads the cap from FREE_AI_DAILY_LIMIT_PER_USER", async () => {
    env.set("FREE_AI_DAILY_LIMIT_PER_USER", "3");
    const r = await spendAs("user-1", 3);
    const err = await refusal(callModel(r, ask));
    expect(err).toMatchObject({ status: 429, extra: { limit: 3 } });
    expect(db.consumeCalls.every((c) => c.p_limit === 3)).toBe(true);
  });

  it("falls back to the default when the config value is not a whole number", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const bad of ["ten", "-1", "2.5", "Infinity"]) {
      env.set("FREE_AI_DAILY_LIMIT_PER_USER", bad);
      expect(freeDailyLimit()).toBe(10);
    }
  });

  it("0 switches the free tier off without calling the model", async () => {
    env.set("FREE_AI_DAILY_LIMIT_PER_USER", "0");
    const r = await resolveTier(authed());
    const err = await refusal(callModel(r, ask));
    expect(err).toMatchObject({ status: 429 });
    expect(err.message).toMatch(/switched off/);
    expect(llmCalls).toHaveLength(0);
  });

  it("never counts or caps a user with their own key", async () => {
    db.settings = { provider: "openrouter", model: "m", api_key: "byo" };
    await spendAs("user-1", 15);
    expect(llmCalls).toHaveLength(15);
    expect(llmCalls.every((auth) => auth === "Bearer byo")).toBe(true);
    expect(db.consumeCalls).toHaveLength(0);
  });

  it("refuses (503) rather than letting a request through uncounted when the counter fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.usageError = { message: "relation does not exist" };
    const r = await resolveTier(authed());
    const err = await refusal(callModel(r, ask));
    expect(err).toMatchObject({ status: 503 });
    expect(llmCalls).toHaveLength(0);
  });

  it("says when the count resets (next UTC midnight)", () => {
    expect(resetPhrase(new Date("2026-11-02T19:00:00Z"))).toBe("in about 5 hours");
    expect(resetPhrase(new Date("2026-11-02T23:30:00Z"))).toBe("within the hour");
    expect(resetPhrase(new Date("2026-11-02T00:00:01Z"))).toBe("in about 24 hours");
  });
});

describe("every AI function goes through the cap", () => {
  it("calls the model only via callModel (ai-settings tests the user's own key, so it may use callLLM)", async () => {
    const { readdirSync, readFileSync, existsSync } = await import("node:fs");
    const root = new URL("..", import.meta.url).pathname;
    const offenders = readdirSync(root)
      .filter((d) => d !== "_shared" && d !== "ai-settings" && existsSync(`${root}${d}/index.ts`))
      .filter((d) => /\bcallLLM\s*\(/.test(readFileSync(`${root}${d}/index.ts`, "utf8")));
    expect(offenders).toEqual([]);
  });
});
