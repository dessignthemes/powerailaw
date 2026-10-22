-- 0049: AI Templates: document templates (deeds, letters, agreements…) with
-- fill-in fields like {{grantor_name}}, made with AI, from pasted text, from a
-- Word/PDF upload, or by hand. Filled for a matter, they become Word documents.
-- Safe to run more than once.

create table if not exists public.doc_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  category text not null default '' check (char_length(category) <= 60),
  description text not null default '' check (char_length(description) <= 600),
  body text not null default '' check (char_length(body) <= 120000),
  fields jsonb not null default '[]'::jsonb,
  source text not null default 'blank' check (source in ('ai', 'paste', 'upload', 'blank', 'sample')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists doc_templates_org_idx on public.doc_templates (org_id, updated_at desc);

alter table public.doc_templates enable row level security;
drop policy if exists "Members manage their firm's document templates" on public.doc_templates;
create policy "Members manage their firm's document templates"
  on public.doc_templates for all
  using (org_id = auth_org_id())
  with check (org_id = auth_org_id());

notify pgrst, 'reload schema';
