-- 0029: secure messages between the firm and a client through the client portal.
-- The message and any attached documents stay in LawPower; email only carries a
-- notice that something is waiting in the portal. Clients reply in the portal.
-- Safe to run more than once.

create table if not exists public.portal_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  matter_id uuid references public.matters (id) on delete cascade,
  direction text not null check (direction in ('firm', 'client')),
  body text not null default '' check (char_length(body) <= 20000),
  document_ids uuid[] not null default '{}',
  sender_user_id uuid references public.profiles (id) on delete set null,
  sender_name text not null default '',
  read_at timestamptz, -- when the other side opened it
  created_at timestamptz not null default now()
);
create index if not exists portal_messages_matter_idx on public.portal_messages (org_id, matter_id, created_at desc);
create index if not exists portal_messages_client_idx on public.portal_messages (client_id, created_at desc);

alter table public.portal_messages enable row level security;
drop policy if exists "Members can manage portal messages in their organization" on public.portal_messages;
create policy "Members can manage portal messages in their organization" on public.portal_messages for all
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

-- Portal activity also records messages.
alter table public.client_portal_events drop constraint if exists client_portal_events_type_check;
alter table public.client_portal_events add constraint client_portal_events_type_check
  check (type in ('invited', 'joined', 'login', 'viewed', 'downloaded', 'message_read', 'replied'));

notify pgrst, 'reload schema';
