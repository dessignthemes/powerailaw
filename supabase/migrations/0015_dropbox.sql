-- LawPower AI — Dropbox: each person can connect their own Dropbox (read-only).
-- Safe to run more than once. Run after 0014_contacts.sql.
--
-- Dropbox tokens live in oauth_connections next to the Google and Microsoft
-- mail tokens: one per person per provider, only readable by that person
-- (row-level security from 0004 is unchanged).

alter table oauth_connections drop constraint if exists oauth_connections_provider_check;
alter table oauth_connections
  add constraint oauth_connections_provider_check
  check (provider in ('google', 'microsoft', 'dropbox'));

-- Provider details that aren't tokens. For Dropbox: the team space root, so
-- people on Dropbox Business also see their team folders.
alter table oauth_connections add column if not exists meta jsonb not null default '{}'::jsonb;

alter table oauth_connections enable row level security;

notify pgrst, 'reload schema';
