-- 0024: Client portal — clients log in to see the documents their law firm
-- shares with them. Clients are NOT firm users: they have their own login,
-- can only see their own matters, and only documents marked as shared.
-- Safe to run more than once.

alter table public.documents add column if not exists portal_shared boolean not null default false;
alter table public.documents add column if not exists portal_shared_at timestamptz;

create table if not exists public.client_portal_users (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  email text not null,
  status text not null default 'invited' check (status in ('invited', 'active', 'disabled')),
  password_hash text,
  invite_token_hash text unique,
  invite_expires_at timestamptz,
  invited_at timestamptz,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id)
);
create index if not exists client_portal_users_email_idx on public.client_portal_users (lower(email));

create table if not exists public.client_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  portal_user_id uuid not null references public.client_portal_users (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  last_seen_at timestamptz not null default now()
);
create index if not exists client_portal_sessions_user_idx on public.client_portal_sessions (portal_user_id);

create table if not exists public.client_portal_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  portal_user_id uuid not null references public.client_portal_users (id) on delete cascade,
  type text not null check (type in ('invited', 'joined', 'login', 'viewed', 'downloaded')),
  document_title text,
  at timestamptz not null default now()
);
create index if not exists client_portal_events_user_idx on public.client_portal_events (portal_user_id, at desc);

alter table public.client_portal_users enable row level security;
alter table public.client_portal_sessions enable row level security;
alter table public.client_portal_events enable row level security;

drop policy if exists "Members can manage client portal access in their organization" on public.client_portal_users;
create policy "Members can manage client portal access in their organization" on public.client_portal_users for all
  using (org_id = auth_org_id()) with check (org_id = auth_org_id());
-- Sessions hold login tokens: no access from the browser at all (server only).
drop policy if exists "No direct access to client portal sessions" on public.client_portal_sessions;
create policy "No direct access to client portal sessions" on public.client_portal_sessions for all using (false) with check (false);
drop policy if exists "Members can read client portal activity in their organization" on public.client_portal_events;
create policy "Members can read client portal activity in their organization" on public.client_portal_events for select
  using (org_id = auth_org_id());

notify pgrst, 'reload schema';
