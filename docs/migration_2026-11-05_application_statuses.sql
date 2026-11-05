-- Application statuses: one vocabulary (Networking, Saved, Applied, Interviewing, Offer, Rejected).
-- NOT APPLIED. Run only after the app build that understands the new words is deployed.
-- Live check 2026-11-05 (read-only): public.applications had 0 rows and no CHECK constraint,
-- so this is safe today; the maps below cover every value the code ever wrote
-- (form: Applied/Interviewing/Accepted/Rejected; board: Bookmarked/Applied/Interview/Offer/Rejected).
-- The app also maps legacy values at read time, so deploy order is: app first, then this file.
-- Re-run the SELECT before applying:  select status, count(*) from public.applications group by 1;

begin;

update public.applications set status = 'Saved'        where lower(trim(status)) = 'bookmarked';
update public.applications set status = 'Interviewing' where lower(trim(status)) = 'interview';
update public.applications set status = 'Offer'        where lower(trim(status)) = 'accepted';
-- Normalise case/whitespace of values already in the new vocabulary.
update public.applications a set status = v.s
  from (values ('Networking'),('Saved'),('Applied'),('Interviewing'),('Offer'),('Rejected')) v(s)
  where lower(trim(a.status)) = lower(v.s) and a.status <> v.s;
-- Anything else unknown becomes Applied (the old default) so no row is left outside the constraint.
update public.applications set status = 'Applied'
  where status not in ('Networking','Saved','Applied','Interviewing','Offer','Rejected');

alter table public.applications alter column status set default 'Applied';

-- Safe because every row was just mapped. An old cached client writing "Accepted" or "Interview"
-- would now get a save error until it refreshes, which is why the app ships first.
alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications add constraint applications_status_check
  check (status in ('Networking','Saved','Applied','Interviewing','Offer','Rejected'));

commit;
