/**
 * The demo's write refusals, reworded.
 *
 * Every write in the demo fails with DEMO_READ_ONLY_MESSAGE, and the app's own error
 * handling turns that into a red toast like "Failed to add target: This is a demo...".
 * Correct, but "Failed" reads as broken in a tour. Here the demo intercepts any error
 * toast carrying that message and shows a neutral one instead: what happened, and the
 * way to keep your work.
 *
 * Done at the toast, not at each of ~40 call sites, so the real app's error handling
 * stays exactly as it is. Installed by boot.ts, which only the /demo page loads.
 */
import { toast as sonnerToast } from "sonner";
import { DEMO_READ_ONLY_MESSAGE, SIGN_UP_PATH } from "./mode";

export const DEMO_REFUSAL_TOAST = {
  /** One id, so clicking around replaces the toast instead of stacking copies. */
  id: "demo-read-only",
  title: "Sign up to keep your changes",
  description: "This demo runs on sample data, so nothing here is saved.",
  actionLabel: "Sign up",
} as const;

export function isDemoRefusal(message: unknown): boolean {
  return typeof message === "string" && message.includes(DEMO_READ_ONLY_MESSAGE);
}

type Toast = typeof sonnerToast;

export function installDemoToasts(toast: Toast = sonnerToast, goTo = (url: string) => window.location.assign(url)): void {
  const showError = toast.error;
  toast.error = ((message, data) => {
    if (!isDemoRefusal(message)) return showError(message, data);
    return toast(DEMO_REFUSAL_TOAST.title, {
      id: DEMO_REFUSAL_TOAST.id,
      description: DEMO_REFUSAL_TOAST.description,
      action: { label: DEMO_REFUSAL_TOAST.actionLabel, onClick: () => goTo(SIGN_UP_PATH) },
    });
  }) as Toast["error"];
}
