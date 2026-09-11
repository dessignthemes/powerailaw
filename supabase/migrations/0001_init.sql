-- PowerAI Law — initial schema
-- Run this in the Supabase SQL editor (or via `supabase db push` with the CLI).

create extension if not exists "pgcrypto";

-- ── Organizations ────────────────────────────────────────────────────────
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Firm',
  url_slug text unique,
  timezone text not null default 'America/New_York',
  logo_url text,
  created_at timestamptz not null default now()
);

-- ── Profiles (one row per authenticated user, mirrors auth.users) ───────
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references organizations (id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now()
);

-- Helper used inside RLS policies below.
create or replace function auth_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from profiles where id = auth.uid()
$$;

-- ── Clients ───────────────────────────────────────────────────────────────
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  description text default '',
  status text not null default 'Active' check (status in ('Active', 'Archived')),
  type text not null default 'Individual' check (type in ('Individual', 'Legal entity')),
  email text,
  phone text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Matters ───────────────────────────────────────────────────────────────
create table if not exists matters (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  client_id uuid references clients (id) on delete set null,
  title text not null,
  description text default '',
  status text not null default 'Lead' check (status in ('Lead', 'Consultation', 'Engaged', 'Active', 'Closed')),
  category text,
  due_date date,
  counterparty text,
  blocker text,
  value numeric,
  billing_type text not null default 'Hourly' check (billing_type in ('Hourly', 'Flat fee')),
  hourly_rate numeric,
  assigned_to uuid references profiles (id) on delete set null,
  private_notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── OAuth connections (Google / Microsoft mailbox + calendar access) ────
create table if not exists oauth_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scopes text[] not null default '{}',
  connected_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, provider)
);

-- ── Row Level Security ────────────────────────────────────────────────────
alter table organizations enable row level security;
alter table profiles enable row level security;
alter table clients enable row level security;
alter table matters enable row level security;
alter table oauth_connections enable row level security;

drop policy if exists "Members can view their own organization" on organizations;
create policy "Members can view their own organization"
  on organizations for select
  using (id = auth_org_id());

drop policy if exists "Members can view profiles in their organization" on profiles;
create policy "Members can view profiles in their organization"
  on profiles for select
  using (org_id = auth_org_id());

drop policy if exists "Members can manage clients in their organization" on clients;
create policy "Members can manage clients in their organization"
  on clients for all
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

drop policy if exists "Members can manage matters in their organization" on matters;
create policy "Members can manage matters in their organization"
  on matters for all
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

drop policy if exists "Members can manage oauth connections in their organization" on oauth_connections;
create policy "Members can manage oauth connections in their organization"
  on oauth_connections for all
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

-- Note: oauth_connections holds access/refresh tokens in plaintext for now.
-- Before going to production, encrypt these at rest (e.g. pgsodium/Vault,
-- or encrypt/decrypt in your API route before writing/reading) and restrict
-- reads to the service_role key rather than the client-side RLS policy above.
