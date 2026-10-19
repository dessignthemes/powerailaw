-- 0043: realtors and other parties in the client portal.
--  * A portal account can belong to a client (as before) or to a party (a realtor,
--    lender...), who sees only the files they were invited to.
--  * Messages have a thread: 'client' (client <-> firm, private, as before),
--    'shared' (client, invited parties and the firm) or 'party' (one party <-> firm).
--    Existing messages stay in the private client thread.
-- Safe to run more than once.

alter table public.client_portal_users alter column client_id drop not null;
alter table public.client_portal_users add column if not exists kind text not null default 'client';
alter table public.client_portal_users drop constraint if exists client_portal_users_kind_check;
alter table public.client_portal_users add constraint client_portal_users_kind_check check (kind in ('client', 'party'));
alter table public.client_portal_users add column if not exists display_name text not null default '';
create unique index if not exists client_portal_users_party_email_uidx
  on public.client_portal_users (org_id, lower(email)) where kind = 'party';

create table if not exists public.portal_matter_access (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  portal_user_id uuid not null references public.client_portal_users (id) on delete cascade,
  matter_id uuid not null references public.matters (id) on delete cascade,
  role text not null default 'Realtor' check (char_length(role) between 1 and 60),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (portal_user_id, matter_id)
);
create index if not exists portal_matter_access_matter_idx on public.portal_matter_access (org_id, matter_id);
alter table public.portal_matter_access enable row level security;
drop policy if exists "Members manage portal access in their organization" on public.portal_matter_access;
create policy "Members manage portal access in their organization" on public.portal_matter_access for all
  using (org_id = auth_org_id()) with check (org_id = auth_org_id());

alter table public.portal_messages alter column client_id drop not null;
alter table public.portal_messages add column if not exists thread text not null default 'client';
alter table public.portal_messages drop constraint if exists portal_messages_thread_check;
alter table public.portal_messages add constraint portal_messages_thread_check check (thread in ('client', 'shared', 'party'));
alter table public.portal_messages add column if not exists party_user_id uuid references public.client_portal_users (id) on delete cascade;
alter table public.portal_messages drop constraint if exists portal_messages_direction_check;
alter table public.portal_messages add constraint portal_messages_direction_check check (direction in ('firm', 'client', 'party'));
create index if not exists portal_messages_thread_idx on public.portal_messages (org_id, matter_id, thread, created_at);

notify pgrst, 'reload schema';
