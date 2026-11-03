-- Bulk select on Network and Watchlist (2026-11-02): "starred" and "tags" on both tables.
--
-- APPLIED to the live project (ypyvkqysnowgegcjydnd) 2026-11-02 as migration bulk_select_starred_tags.
-- Apply BEFORE deploying the branch worker/coffee-bulk-select: the app selects these
-- columns, so deploying first makes the contact list fail to load (PGRST 42703).
--
-- Additive and safe on a live table: four NOT NULL columns with constant defaults
-- (metadata-only in Postgres 11+, no table rewrite), plus a length cap on tags. Nothing
-- existing changes. No policy change is needed: the live policies are
-- `app_user_id() = owner_id` for every command (contacts: select/insert/update/delete;
-- watchlist_targets: ALL), they apply to the whole row, so they cover the new columns, and
-- UPDATE already has WITH CHECK, so a bulk update cannot re-assign a row to another owner.
--
-- Rollback: alter table ... drop column starred, drop column tags (and the two constraints).

alter table public.contacts
  add column if not exists starred boolean not null default false,
  add column if not exists tags text[] not null default '{}';

alter table public.watchlist_targets
  add column if not exists starred boolean not null default false,
  add column if not exists tags text[] not null default '{}';

-- At most 20 tags per row, so a bulk "tag" cannot bloat a row. (The app also trims tags and
-- caps each at 24 characters.)
alter table public.contacts
  drop constraint if exists contacts_tags_max20;
alter table public.contacts
  add constraint contacts_tags_max20 check (cardinality(tags) <= 20);

alter table public.watchlist_targets
  drop constraint if exists watchlist_targets_tags_max20;
alter table public.watchlist_targets
  add constraint watchlist_targets_tags_max20 check (cardinality(tags) <= 20);
