import { describe, expect, it, vi } from "vitest";
import type { toast as sonnerToast } from "sonner";
import { DEMO_REFUSAL_TOAST, installDemoToasts, isDemoRefusal } from "./demoToasts";
import { DEMO_READ_ONLY_MESSAGE, SIGN_UP_PATH } from "./mode";

/** A stand-in for sonner's `toast`: a callable with an `.error`, recording every call. */
function fakeToast() {
  const neutral = vi.fn<(...args: unknown[]) => string>(() => "id");
  const error = vi.fn<(...args: unknown[]) => string>(() => "id");
  const toast = Object.assign(neutral, { error }) as unknown as typeof sonnerToast;
  return { toast, neutral, error };
}

// The exact strings the pages build today (WatchlistPage, OutreachEmailsPage, useMeetings,
// and errorMessage() call sites that pass the message through unprefixed).
const REFUSALS = [
  `Failed to add target: ${DEMO_READ_ONLY_MESSAGE}`,
  `Failed to schedule: ${DEMO_READ_ONLY_MESSAGE}`,
  `Failed to save meeting note: ${DEMO_READ_ONLY_MESSAGE}`,
  DEMO_READ_ONLY_MESSAGE,
];

describe("demo refusal toasts", () => {
  it.each(REFUSALS)("shows a neutral sign-up toast instead of an error: %s", (message) => {
    const { toast, neutral, error } = fakeToast();
    const goTo = vi.fn();
    installDemoToasts(toast, goTo);

    toast.error(message);

    expect(error).not.toHaveBeenCalled();
    expect(neutral).toHaveBeenCalledTimes(1);
    const [title, opts] = neutral.mock.calls[0] as [string, { id: string; description: string; action: { label: string; onClick: () => void } }];
    expect(title).toBe(DEMO_REFUSAL_TOAST.title);
    expect(opts.id).toBe(DEMO_REFUSAL_TOAST.id);
    expect(opts.description).toBe(DEMO_REFUSAL_TOAST.description);
    expect(opts.action.label).toBe("Sign up");

    opts.action.onClick();
    expect(goTo).toHaveBeenCalledWith(SIGN_UP_PATH);
  });

  it("copy is short, friendly and never says failed or error", () => {
    const copy = [DEMO_REFUSAL_TOAST.title, DEMO_REFUSAL_TOAST.description, DEMO_REFUSAL_TOAST.actionLabel];
    for (const text of copy) {
      expect(text).not.toMatch(/fail|error|denied|can't|cannot/i);
      expect(text).not.toMatch(/!/);
    }
    expect(DEMO_REFUSAL_TOAST.title.length).toBeLessThanOrEqual(40);
    expect(DEMO_REFUSAL_TOAST.description.length).toBeLessThanOrEqual(70);
    // Sentence case, per the design rules.
    expect(DEMO_REFUSAL_TOAST.title).toMatch(/^[A-Z][^A-Z]*$/);
  });

  it("leaves every other error toast exactly as it was", () => {
    const { toast, neutral, error } = fakeToast();
    installDemoToasts(toast, vi.fn());

    toast.error("Person name and company are required.", { duration: 5 });

    expect(neutral).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("Person name and company are required.", { duration: 5 });
  });

  it("recognises only the demo's own refusal message", () => {
    expect(isDemoRefusal(`Failed: ${DEMO_READ_ONLY_MESSAGE}`)).toBe(true);
    expect(isDemoRefusal("Failed to add target: permission denied")).toBe(false);
    expect(isDemoRefusal(undefined)).toBe(false);
  });
});
