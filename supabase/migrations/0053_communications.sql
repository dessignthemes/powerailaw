-- 0053: Communications (Tools → Communications).
--   communications: phone call logs (with "needs a call back" → a task) and
--   internal messages between colleagues, optionally tagged to a matter / client.
--   notifications: new kind 'internal_message'.
-- Safe to run more than once.

create table if not exists public.communications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('call', 'internal')),
  direction text not null default '' check (direction in ('in', 'out', '')),
  contact_name text not null default '' check (char_length(contact_name) <= 200),
  contact_phone text not null default '' check (char_length(contact_phone) <= 60),
  client_id uuid references public.clients (id) on delete set null,
  matter_id uuid references public.matters (id) on delete set null,
  subject text not null default '' check (char_length(subject) <= 300),
  body text not null default '' check (char_length(body) <= 5000),
  occurred_at timestamptz not null default now(),
  duration_min integer check (duration_min is null or (duration_min >= 0 and duration_min <= 1440)),
  callback_needed boolean not null default false,
  callback_done_at timestamptz,
  task_id uuid references public.tasks (id) on delete set null,
  recipients uuid[] not null default '{}',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists communications_org_idx on public.communications (org_id, kind, occurred_at desc);
create index if not exists communications_matter_idx on public.communications (matter_id);

alter table public.communications enable row level security;
drop policy if exists "Members manage their firm's communications" on public.communications;
create policy "Members manage their firm's communications"
  on public.communications for all
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('task_assigned', 'matter_assigned', 'task_offered', 'task_accepted', 'portal_message', 'internal_message'));

notify pgrst, 'reload schema';
