-- PowerAI Law — matter documents with version history (Power PDF)
-- Run this in the Supabase SQL editor after 0002_tasks.sql.

-- ── Documents: one row per logical file on a matter ──────────────────────
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  matter_id uuid not null references matters (id) on delete cascade,
  title text not null,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_matter_idx on documents (org_id, matter_id);

-- ── Versions: every save creates a new row; files are never overwritten ──
create table if not exists document_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  document_id uuid not null references documents (id) on delete cascade,
  version_number integer not null,
  storage_path text not null unique,
  size_bytes bigint not null,
  page_count integer not null,
  has_form_fields boolean not null default false,
  note text not null default '',
  based_on_version_id uuid references document_versions (id) on delete set null,
  created_by uuid references profiles (id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  unique (document_id, version_number)
);

create index if not exists document_versions_doc_idx on document_versions (document_id, version_number desc);

alter table documents enable row level security;
alter table document_versions enable row level security;

drop policy if exists "Members can manage documents in their organization" on documents;
create policy "Members can manage documents in their organization"
  on documents for all
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

drop policy if exists "Members can view document versions in their organization" on document_versions;
create policy "Members can view document versions in their organization"
  on document_versions for select
  using (org_id = auth_org_id());

-- ── Private storage bucket ────────────────────────────────────────────────
-- Files are only reachable through short-lived signed URLs issued by the
-- app's API after it checks the user can access the matter. No public
-- access and no storage policies for anon/authenticated roles.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('matter-documents', 'matter-documents', false, 26214400, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
