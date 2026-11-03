/**
 * Demo mode: the public, signed-out tour of Coffee at /demo.
 *
 * It is decided once, when this module first loads, from the URL the page was opened on.
 * Nothing flips it afterwards: entering or leaving the demo is a full page load (a plain
 * <a href>), so a session can never be half real and half demo. Everything that must
 * behave differently in the demo -- which database client exists, which router base is
 * used, whether Clerk mounts -- reads this one constant.
 *
 * Deliberately has no imports, so the real app can read it without pulling in any demo
 * code.
 */
export const DEMO_BASE = "/demo";

export const DEMO_READ_ONLY_MESSAGE = "This is a demo with sample data. Sign up to save your own changes.";

/** Where "Sign up" goes, from the demo and from the sign-in card: Clerk's sign-up form. */
export const SIGN_UP_PATH = "/sign-up";

/** "/demo" and anything under it; not "/demonstration". */
export function isDemoPath(pathname: string): boolean {
  return pathname === DEMO_BASE || pathname.startsWith(`${DEMO_BASE}/`);
}

/** The app-relative path for a URL pathname: "/demo/applications" -> "/applications". */
export function stripDemoBase(pathname: string): string {
  if (!isDemoPath(pathname)) return pathname;
  return pathname.slice(DEMO_BASE.length) || "/";
}

/** The URL path for an app-relative path while in demo mode: "/" -> "/demo". */
export function withDemoBase(path: string): string {
  return path === "/" ? DEMO_BASE : `${DEMO_BASE}${path}`;
}

// The Electron build loads over file://, where the pathname is a path on disk. It is
// never the demo.
export const isDemoMode: boolean =
  typeof window !== "undefined" &&
  window.location.protocol !== "file:" &&
  isDemoPath(window.location.pathname);
