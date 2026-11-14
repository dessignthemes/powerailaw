-- 0071: Folders (and subfolders) for a matter's documents.
-- A document sits in one folder (folder_id) or at the top level (null).
-- Safe to run more than once.

create table if not exists public.document_folders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  matter_id uuid not null references public.matters (id) on delete cascade,
  parent_id uuid references public.document_folders (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists document_folders_matter_idx on public.document_folders (org_id, matter_id);

alter table public.documents add column if not exists folder_id uuid references public.document_folders (id) on delete set null;
create index if not exists documents_folder_idx on public.documents (folder_id);

alter table public.document_folders enable row level security;
drop policy if exists "Firm members manage document folders" on public.document_folders;
create policy "Firm members manage document folders" on public.document_folders for all
  using (org_id = auth_org_id()) with check (org_id = auth_org_id());

notify pgrst, 'reload schema';
