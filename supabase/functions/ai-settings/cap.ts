import { HttpError } from "../_shared/tier.ts";

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** Default attempts per user per UTC day for ai-settings test/save. */
export const DEFAULT_DAILY_LIMIT = 20;

export function dailyLimit(raw: string | undefined): number {
  const n = Number(raw);
  return raw !== undefined && raw !== "" && Number.isInteger(n) && n >= 0 ? n : DEFAULT_DAILY_LIMIT;
}

/** Counts one test/save attempt; throws 429 once the user is over the daily cap. */
export async function spendSettingsAttempt(rpc: Rpc, userId: string, limit: number): Promise<void> {
  const { data, error } = await rpc("consume_ai_settings_attempt", { p_user: userId, p_limit: limit });
  if (error) throw new HttpError("Could not check your key right now. Try again in a minute.", 503);
  if (data === null || data === undefined) {
    throw new HttpError("Too many key checks today. Try again tomorrow.", 429, { reason: "ai_settings_daily_limit", limit });
  }
}
