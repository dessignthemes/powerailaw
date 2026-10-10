-- 0023: Secure Files — send files to someone, or ask someone to upload files,
-- through a private link. Links and their files are deleted after 7 days.
-- Safe to run more than once.

create table if not exists public.file_shares (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('send', 'request')),
  title text not null check (char_length(title) between 1 and 120),
  message text not null default '',
  recipient_email text,
  token_hash text not null unique,
  password_hash text,
  failed_attempts int not null default 0,
  matter_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  purged_at timestamptz,          -- files deleted from storage
  last_opened_at timestamptz,
  open_count int not null default 0
);
create index if not exists file_shares_org_idx on public.file_shares (org_id, created_at desc);
create index if not exists file_shares_expires_idx on public.file_shares (expires_at) where purged_at is null;

create table if not exists public.file_share_files (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.file_shares (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  size bigint not null default 0,
  mime text not null default 'application/octet-stream',
  storage_path text not null,
  added_by text not null check (added_by in ('firm', 'recipient')),
  status text not null default 'pending' check (status in ('pending', 'ready')),
  download_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists file_share_files_share_idx on public.file_share_files (share_id);

create table if not exists public.file_share_events (
  id bigint generated always as identity primary key,
  share_id uuid not null references public.file_shares (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  type text not null check (type in ('opened', 'downloaded', 'uploaded', 'locked')),
  file_name text,
  at timestamptz not null default now()
);
create index if not exists file_share_events_share_idx on public.file_share_events (share_id, at desc);

alter table public.file_shares enable row level security;
alter table public.file_share_files enable row level security;
alter table public.file_share_events enable row level security;

drop policy if exists "Members can manage file shares in their organization" on public.file_shares;
create policy "Members can manage file shares in their organization" on public.file_shares for all
  using (org_id = auth_org_id()) with check (org_id = auth_org_id());
drop policy if exists "Members can manage shared files in their organization" on public.file_share_files;
create policy "Members can manage shared files in their organization" on public.file_share_files for all
  using (org_id = auth_org_id()) with check (org_id = auth_org_id());
drop policy if exists "Members can read share activity in their organization" on public.file_share_events;
create policy "Members can read share activity in their organization" on public.file_share_events for select
  using (org_id = auth_org_id());

-- Private bucket; files are only reached through short-lived signed links.
-- 2 GB per file (Supabase's own "Upload file size limit" must be at least this).
insert into storage.buckets (id, name, public, file_size_limit)
values ('file-shares', 'file-shares', false, 2147483648)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

notify pgrst, 'reload schema';
