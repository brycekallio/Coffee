// Domain types derive from the generated table types, so they cannot drift from the live
// schema. Where a page fetches only some columns, the type is a Pick of exactly those
// columns — keep it in step with the .select() that loads it.
import type { Tables } from "./lib/database.types";

/** Loaded in App.loadContacts. `status` is kept for DB compatibility; not shown in UI. */
export type Contact = Pick<
  Tables<"contacts">,
  "id" | "owner_id" | "first_name" | "last_name" | "company" | "title" | "email" | "phone" | "linkedin_url" | "status" | "created_at" | "starred" | "tags"
>;

export type ContactMeeting = Tables<"contact_meetings">;

/** Loaded in App.loadProfile. */
export type Profile = Pick<
  Tables<"profiles">,
  | "id"
  | "full_name"
  | "my_linkedin_url"
  | "resume_url"
  | "avatar_url"
  | "resume_text"
  | "phone"
  | "career_interests"
  | "onboarding_completed_at"
  | "google_calendar_token"
  | "google_calendar_refresh_token"
  | "google_calendar_token_expiry"
>;

export type Application = Tables<"applications">;

export type Page =
  | "contacts"
  | "contact_details"
  | "applications"
  | "analytics"
  | "settings"
  | "onboarding"
  | "network_watchlist"
  | "outreach_emails"
  | "jd_scorer";

/** status: "not_contacted" | "contacted" | "scheduled" | "completed" | "follow_up_sent" */
export type WatchlistTarget = Tables<"watchlist_targets">;

/** channel: "email" | "sms". status: "scheduled" | "sending" | "sent" | "failed" | "skipped" | "opened" */
export type ScheduledOutreach = Tables<"scheduled_outreach">;

export type FieldMap = {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  company?: string;
  title?: string;
  status?: string;
};

export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};
