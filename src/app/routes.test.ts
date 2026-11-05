import { describe, expect, it } from "vitest";
import { parsePath, toPath, type Route } from "./routes";

describe("routes", () => {
  it("round-trips every page", () => {
    const routes: Route[] = [
      { page: "contacts" },
      { page: "contact_details", contactId: "2acc6abc-0e54-4582-98cf-7e521349814d" },
      { page: "network_watchlist" },
      { page: "outreach_emails" },
      { page: "applications" },
      { page: "jd_scorer" },
      { page: "resume_review" },
      { page: "analytics" },
      { page: "settings" },
      { page: "onboarding" },
    ];
    for (const r of routes) expect(parsePath(toPath(r))).toEqual(r);
  });

  it("tolerates a trailing slash and the /contacts alias", () => {
    expect(parsePath("/settings/")).toEqual({ page: "settings" });
    expect(parsePath("/contacts")).toEqual({ page: "contacts" });
  });

  it("returns null for unknown paths so the app can redirect", () => {
    expect(parsePath("/nope")).toBeNull();
    expect(parsePath("/contacts/a/b")).toBeNull();
  });

  it("falls back to the list for a detail route with no contact", () => {
    expect(toPath({ page: "contact_details" })).toBe("/");
  });
});
