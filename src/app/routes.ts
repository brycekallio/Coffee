import type { Page } from "@/types";

/** Where the app is: a page, plus the contact for the detail page. */
export type Route = { page: Page; contactId?: string };

const PATHS: Record<Exclude<Page, "contact_details">, string> = {
  contacts: "/",
  network_watchlist: "/watchlist",
  outreach_emails: "/outreach",
  applications: "/applications",
  jd_scorer: "/jd-scorer",
  resume_review: "/resume-review",
  analytics: "/analytics",
  settings: "/settings",
  onboarding: "/welcome",
};

const BY_PATH = new Map(Object.entries(PATHS).map(([page, path]) => [path, page as Page]));

export function toPath(route: Route): string {
  if (route.page === "contact_details") {
    return route.contactId ? `/contacts/${encodeURIComponent(route.contactId)}` : "/";
  }
  return PATHS[route.page];
}

/** Unknown paths resolve to null; the caller redirects them to the contact list. */
export function parsePath(path: string): Route | null {
  const clean = path.replace(/\/+$/, "") || "/";
  const detail = /^\/contacts\/([^/]+)$/.exec(clean);
  if (detail) return { page: "contact_details", contactId: decodeURIComponent(detail[1]) };
  if (clean === "/contacts") return { page: "contacts" };
  const page = BY_PATH.get(clean);
  return page ? { page } : null;
}
