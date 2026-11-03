import { AiHttpError, invokeAi } from "@/features/ai/client";
import {
  cleanContactFields,
  extractObvious,
  isEmptyFields,
  type ContactFields,
} from "../../../supabase/functions/_shared/contactFields.ts";

/** Same limit the Edge Function enforces; the textarea uses it too. */
export const PASTE_CHAR_LIMIT = 15_000;

export type FillOutcome =
  /** The AI read the text. `fields` has only the non-empty values. */
  | { kind: "ai"; fields: Partial<ContactFields> }
  /** The AI couldn't run (daily limit, outage, unreadable answer); `fields` is what plain pattern matching found. */
  | { kind: "fallback"; fields: Partial<ContactFields>; reason: "limit" | "error"; message: string };

const nonEmpty = (f: Partial<ContactFields>) =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v)) as Partial<ContactFields>;

/**
 * Pasted LinkedIn profile text → contact form fields.
 *
 * Calls the `fill-contact-from-text` Edge Function (free tier: counts against the user's
 * daily AI requests). The answer is cleaned again here even though the function already
 * cleaned it: the browser doesn't have to trust the server's output to be safe.
 * When the AI is capped or down, a LinkedIn link / email written in the text is still
 * picked out locally, so the paste isn't wasted.
 *
 * Nothing is fetched from LinkedIn; the only input is the text the user pasted.
 */
export async function fillFromProfileText(text: string): Promise<FillOutcome> {
  const trimmed = text.trim();
  try {
    const res = await invokeAi<{ fields?: unknown }>("fill-contact-from-text", { text: trimmed });
    const fields = cleanContactFields(res?.fields);
    if (isEmptyFields(fields)) throw new AiHttpError("The AI didn't find anyone in that text.", 422);
    return { kind: "ai", fields: nonEmpty(fields) };
  } catch (e) {
    const status = e instanceof AiHttpError ? e.status : undefined;
    const message = e instanceof Error ? e.message : "The AI couldn't read that.";
    return {
      kind: "fallback",
      fields: nonEmpty(extractObvious(trimmed)),
      reason: status === 429 ? "limit" : "error",
      message,
    };
  }
}

/** Merge for the form: a value the AI found replaces the field; a blank never erases what's typed. */
export function mergeIntoForm<T extends Record<string, string>>(current: T, found: Partial<Record<keyof T, string>>): T {
  const next = { ...current };
  for (const key of Object.keys(found) as (keyof T)[]) {
    const v = found[key];
    if (v) next[key] = v as T[keyof T];
  }
  return next;
}
