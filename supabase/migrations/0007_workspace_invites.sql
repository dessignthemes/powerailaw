-- LawPower AI — team workspaces by invitation
-- Run in the Supabase SQL editor after 0006_workspace_per_account.sql.
--
-- A workspace owner or admin can invite colleagues who have the same
-- company email domain. The invite link contains a random secret; only its
-- SHA-256 hash is stored here. The link works once, only for the invited
-- email address, and expires after 14 days.

create table if not exists workspace_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null default 'member' check (role in ('admin', 'member')),
  token_hash text not null unique,
  invited_by uuid references profiles (id) on delete set null,
  invited_by_email text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references profiles (id) on delete set null
);

-- At most one open invite per email per workspace.
create unique index if not exists workspace_invites_open_idx
  on workspace_invites (org_id, email) where status = 'pending';

alter table workspace_invites enable row level security;

drop policy if exists "Members can view their workspace invites" on workspace_invites;
create policy "Members can view their workspace invites" on workspace_invites for select
  using (org_id = auth_org_id());

notify pgrst, 'reload schema';
