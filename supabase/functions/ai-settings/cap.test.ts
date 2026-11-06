import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("Deno", { env: { get: () => undefined } });
vi.mock("jsr:@supabase/supabase-js@2", () => ({ createClient: () => ({}) }));

import { dailyLimit, DEFAULT_DAILY_LIMIT, spendSettingsAttempt } from "./cap.ts";

// Fake of consume_ai_settings_attempt: the new count, or null (no write) past the limit.
function fakeRpc() {
  const used = new Map<string, number>();
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    const u = String(args.p_user);
    const n = used.get(u) ?? 0;
    if ((args.p_limit as number) <= 0 || n >= (args.p_limit as number)) return { data: null, error: null };
    used.set(u, n + 1);
    return { data: n + 1, error: null };
  };
  return { rpc, calls };
}

describe("spendSettingsAttempt", () => {
  it("allows attempts up to the limit, then answers 429", async () => {
    const { rpc, calls } = fakeRpc();
    await spendSettingsAttempt(rpc, "u1", 2);
    await spendSettingsAttempt(rpc, "u1", 2);
    await expect(spendSettingsAttempt(rpc, "u1", 2)).rejects.toMatchObject({ status: 429 });
    expect(calls[0]).toEqual({ fn: "consume_ai_settings_attempt", args: { p_user: "u1", p_limit: 2 } });
  });

  it("caps each user separately", async () => {
    const { rpc } = fakeRpc();
    await spendSettingsAttempt(rpc, "u1", 1);
    await expect(spendSettingsAttempt(rpc, "u2", 1)).resolves.toBeUndefined();
  });

  it("a limit of 0 switches key checks off", async () => {
    const { rpc } = fakeRpc();
    await expect(spendSettingsAttempt(rpc, "u1", 0)).rejects.toMatchObject({ status: 429 });
  });

  it("fails closed with 503 when the database call errors", async () => {
    const rpc = async () => ({ data: null, error: { message: "boom" } });
    await expect(spendSettingsAttempt(rpc, "u1", 5)).rejects.toMatchObject({ status: 503 });
  });
});

describe("dailyLimit", () => {
  it("reads a non-negative integer, else the default", () => {
    expect(dailyLimit("7")).toBe(7);
    expect(dailyLimit("0")).toBe(0);
    expect(dailyLimit(undefined)).toBe(DEFAULT_DAILY_LIMIT);
    expect(dailyLimit("")).toBe(DEFAULT_DAILY_LIMIT);
    expect(dailyLimit("abc")).toBe(DEFAULT_DAILY_LIMIT);
    expect(dailyLimit("-3")).toBe(DEFAULT_DAILY_LIMIT);
  });
});
