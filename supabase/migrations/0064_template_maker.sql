-- 0064: Template maker. A template can now be the firm's own Word file with
-- {{fields}} tagged inside it (formatting kept), plus typed fields (text, date,
-- amount, choice, yes/no for optional clauses). Every save is kept as a version
-- (who, when) so a template can be rolled back.
-- Safe to run more than once.

alter table public.doc_templates add column if not exists format text not null default 'text';
alter table public.doc_templates drop constraint if exists doc_templates_format_check;
alter table public.doc_templates add constraint doc_templates_format_check check (format in ('text', 'docx'));
alter table public.doc_templates add column if not exists file_path text; -- tagged .docx in storage (format = docx)
alter table public.doc_templates add column if not exists version integer not null default 1;

create table if not exists public.doc_template_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  template_id uuid not null references public.doc_templates (id) on delete cascade,
  version integer not null,
  name text not null default '',
  body text not null default '',
  fields jsonb not null default '[]'::jsonb,
  file_path text,
  note text not null default '' check (char_length(note) <= 300),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (template_id, version)
);
create index if not exists doc_template_versions_idx on public.doc_template_versions (template_id, version desc);

alter table public.doc_template_versions enable row level security;
drop policy if exists "Members see their firm's template versions" on public.doc_template_versions;
create policy "Members see their firm's template versions"
  on public.doc_template_versions for all
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

notify pgrst, 'reload schema';
