-- 0045: Contacts can be imported (Outlook, iPhone / iCloud vCard, RingCentral or
-- any CSV) and kept in step with Outlook.
--   source       where the contact came from: 'manual', 'outlook', 'vcard', 'csv'
--   external_id  the contact's id in Outlook, so a re-import updates instead of duplicating
--   imported_by  who imported or synced it
-- contact_syncs remembers, per person, where the last Outlook sync stopped.
-- Safe to run more than once.

alter table public.contacts add column if not exists source text not null default 'manual';
alter table public.contacts add column if not exists external_id text;
alter table public.contacts add column if not exists imported_by uuid references public.profiles (id) on delete set null;

create unique index if not exists contacts_org_external_uidx
  on public.contacts (org_id, source, external_id) where external_id is not null;
create index if not exists contacts_org_email_idx on public.contacts (org_id, lower(email));

create table if not exists public.contact_syncs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null check (provider in ('microsoft')),
  enabled boolean not null default true,
  delta_link text,
  last_synced_at timestamptz,
  last_added integer not null default 0,
  primary key (user_id, provider)
);

alter table public.contact_syncs enable row level security;

drop policy if exists "People see their own contact sync" on public.contact_syncs;
create policy "People see their own contact sync"
  on public.contact_syncs for select
  using (user_id = auth.uid() and org_id = auth_org_id());

notify pgrst, 'reload schema';
