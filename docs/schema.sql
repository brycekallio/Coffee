-- Coffee? — Supabase Schema
-- Run this in Supabase SQL Editor to create all required tables.
-- All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so it is safe to re-run.

-- ── contacts ──────────────────────────────────────────────────────────────────
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  company text,
  title text,
  email text,
  phone text,
  linkedin_url text,
  status text not null default 'to_contact',
  created_at timestamptz not null default now()
);

create index if not exists idx_contacts_owner_id on public.contacts(owner_id);

alter table public.contacts enable row level security;

create policy "contacts_select_own" on public.contacts for select using (auth.uid() = owner_id);
create policy "contacts_insert_own" on public.contacts for insert with check (auth.uid() = owner_id);
create policy "contacts_update_own" on public.contacts for update using (auth.uid() = owner_id);
create policy "contacts_delete_own" on public.contacts for delete using (auth.uid() = owner_id);

-- ── profiles ──────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  my_linkedin_url text,
  resume_url text,
  avatar_url text,
  resume_text text,
  onboarding_completed_at timestamptz,
  phone text,
  career_interests text,
  google_calendar_token text,
  google_calendar_refresh_token text,
  google_calendar_token_expiry text
);

-- Idempotent column additions (safe to re-run on existing databases)
alter table public.profiles
  add column if not exists phone                          text,
  add column if not exists career_interests               text,
  add column if not exists google_calendar_token          text,
  add column if not exists google_calendar_refresh_token  text,
  add column if not exists google_calendar_token_expiry   text;

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Auto-provisions a blank profiles row the moment a new auth user is created, so a row
-- always exists even if the client never gets to run its own insert. IMPORTANT: this means
-- app code must never assume "no profiles row yet" implies "brand new user" — treat any
-- sign-up-time data (name, phone, LinkedIn, etc.) as something to UPDATE into an existing
-- row, not something to INSERT with. This trigger already existed live in the database
-- but was undocumented here; loadProfile()'s original insert-only logic silently discarded
-- every new user's sign-up data as a result. See src/App.tsx's loadProfile().
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Resumes storage bucket — PRIVATE. Objects are keyed by `<user_id>/resume.<ext>`; the app
-- reads/writes them via signed URLs (see getResumeUrl() in src/App.tsx), never a public URL.
insert into storage.buckets (id, name, public)
  values ('resumes', 'resumes', false)
  on conflict (id) do update set public = false;

drop policy if exists "resumes_select_own" on storage.objects;
create policy "resumes_select_own" on storage.objects for select
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "resumes_insert_own" on storage.objects;
create policy "resumes_insert_own" on storage.objects for insert
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "resumes_update_own" on storage.objects;
create policy "resumes_update_own" on storage.objects for update
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "resumes_delete_own" on storage.objects;
create policy "resumes_delete_own" on storage.objects for delete
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── contact_meetings ──────────────────────────────────────────────────────────
create table if not exists public.contact_meetings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  meeting_date date not null,
  title text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_contact_meetings_contact_id on public.contact_meetings(contact_id);
create index if not exists idx_contact_meetings_owner_id on public.contact_meetings(owner_id);

alter table public.contact_meetings enable row level security;

create policy "meetings_select_own" on public.contact_meetings for select using (auth.uid() = owner_id);
create policy "meetings_insert_own" on public.contact_meetings for insert with check (auth.uid() = owner_id);
create policy "meetings_update_own" on public.contact_meetings for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "meetings_delete_own" on public.contact_meetings for delete using (auth.uid() = owner_id);

-- ── applications ──────────────────────────────────────────────────────────────
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  company text not null,
  link text,
  date_applied date,
  status text not null default 'Applied',
  contact_id uuid references public.contacts(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_applications_owner_id on public.applications(owner_id);
create index if not exists idx_applications_contact_id on public.applications(contact_id);

alter table public.applications enable row level security;

create policy "applications_select_own" on public.applications for select using (auth.uid() = owner_id);
create policy "applications_insert_own" on public.applications for insert with check (auth.uid() = owner_id);
create policy "applications_update_own" on public.applications for update using (auth.uid() = owner_id);
create policy "applications_delete_own" on public.applications for delete using (auth.uid() = owner_id);

-- ── watchlist_targets ─────────────────────────────────────────────────────────
create table if not exists public.watchlist_targets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  person_name text not null,
  company text not null,
  role text,
  status text not null default 'not_contacted',
  next_action_date date,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.watchlist_targets enable row level security;

create policy "watchlist_all_own" on public.watchlist_targets for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ── scheduled_outreach ────────────────────────────────────────────────────────
create table if not exists public.scheduled_outreach (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  channel text not null,
  subject text,
  message text not null,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled',
  created_at timestamptz not null default now()
);

alter table public.scheduled_outreach enable row level security;

create policy "outreach_all_own" on public.scheduled_outreach for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ── email open tracking (run after initial setup if upgrading) ────────────────
alter table public.scheduled_outreach
  add column if not exists tracking_token uuid default gen_random_uuid(),
  add column if not exists opened_at timestamptz;

-- Edge Function looks up rows by tracking_token — index for performance
create index if not exists idx_outreach_tracking_token
  on public.scheduled_outreach(tracking_token);
