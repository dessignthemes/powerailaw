-- PowerAI Law — AI Agent: conversations, document search index, memory,
-- confirmed actions, usage and audit.
-- Run in the Supabase SQL editor after 0004_personal_mail_connections.sql.
--
-- All rows carry org_id. The app's API uses the service role and enforces
-- access in code; the RLS policies below are defence in depth for any
-- direct (anon/authenticated) access.

-- ── Conversations & messages (private to the user who created them) ─────
create table if not exists ai_conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  -- Fixed at creation. A different matter always means a different conversation.
  matter_id uuid references matters (id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_conversations_user_idx on ai_conversations (user_id, updated_at desc);

create table if not exists ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations (id) on delete cascade,
  org_id uuid not null references organizations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  status text not null default 'complete' check (status in ('complete', 'streaming', 'interrupted', 'failed')),
  error text,
  citations jsonb not null default '[]'::jsonb,     -- [{ id, label, kind, documentId, versionId, fileId, name, page, section }]
  events jsonb not null default '[]'::jsonb,        -- action proposals, memory suggestions, tool activity
  attachment_ids uuid[] not null default '{}',
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_conv_idx on ai_messages (conversation_id, created_at);

-- ── Chat attachments (PDF / DOCX / TXT) ─────────────────────────────────
create table if not exists ai_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  conversation_id uuid not null references ai_conversations (id) on delete cascade,
  matter_id uuid references matters (id) on delete cascade,
  name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  storage_path text not null unique,
  status text not null default 'processing' check (status in ('processing', 'ready', 'needs_ocr', 'failed')),
  status_detail text,
  page_count integer,
  created_at timestamptz not null default now()
);
create index if not exists ai_files_conv_idx on ai_files (conversation_id);

-- Index status for matter documents stored by Power PDF (per version).
create table if not exists ai_document_index (
  version_id uuid primary key references document_versions (id) on delete cascade,
  org_id uuid not null references organizations (id) on delete cascade,
  status text not null check (status in ('ready', 'needs_ocr', 'failed')),
  status_detail text,
  page_count integer,
  indexed_at timestamptz not null default now()
);

-- ── Text chunks + Postgres full-text search ─────────────────────────────
-- Deleting a file, a document version or a conversation deletes its chunks.
create table if not exists ai_chunks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  file_id uuid references ai_files (id) on delete cascade,
  version_id uuid references document_versions (id) on delete cascade,
  chunk_index integer not null,
  page integer,          -- real PDF page number when known
  section text,          -- heading / line range otherwise
  content text not null,
  tsv tsvector generated always as (to_tsvector('english', content)) stored,
  check ((file_id is null) <> (version_id is null))
);
create index if not exists ai_chunks_tsv_idx on ai_chunks using gin (tsv);
create index if not exists ai_chunks_file_idx on ai_chunks (file_id, chunk_index);
create index if not exists ai_chunks_version_idx on ai_chunks (version_id, chunk_index);

-- Ranked search restricted to explicitly authorized files/versions.
create or replace function ai_search_chunks(
  p_org uuid,
  p_file_ids uuid[],
  p_version_ids uuid[],
  p_query text,
  p_limit integer
)
returns table (id uuid, file_id uuid, version_id uuid, chunk_index integer, page integer, section text, content text, rank real)
language sql
stable
set search_path = public
as $$
  select c.id, c.file_id, c.version_id, c.chunk_index, c.page, c.section, c.content,
         ts_rank_cd(c.tsv, q) as rank
  from ai_chunks c, websearch_to_tsquery('english', p_query) q
  where c.org_id = p_org
    and (c.file_id = any (p_file_ids) or c.version_id = any (p_version_ids))
    and c.tsv @@ q
  order by rank desc, c.chunk_index asc
  limit least(greatest(p_limit, 1), 40)
$$;
revoke all on function ai_search_chunks(uuid, uuid[], uuid[], text, integer) from public, anon, authenticated;

-- ── Memory ──────────────────────────────────────────────────────────────
create table if not exists ai_memories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  scope text not null check (scope in ('personal', 'firm', 'matter')),
  user_id uuid references profiles (id) on delete cascade,        -- owner, for personal memories
  matter_id uuid references matters (id) on delete cascade,        -- for matter memories
  content text not null check (char_length(content) between 1 and 1000),
  enabled boolean not null default true,
  source text not null default 'manual' check (source in ('manual', 'suggested')),
  source_conversation_id uuid references ai_conversations (id) on delete set null,
  created_by uuid references profiles (id) on delete set null,
  updated_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'matter') = (matter_id is not null)),
  check (scope <> 'personal' or user_id is not null)
);
create index if not exists ai_memories_org_idx on ai_memories (org_id, scope);

-- ── Proposed write actions awaiting confirmation ────────────────────────
create table if not exists ai_pending_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  conversation_id uuid not null references ai_conversations (id) on delete cascade,
  matter_id uuid references matters (id) on delete cascade,
  tool text not null check (tool in ('createClient', 'createTask', 'saveDocumentDraft')),
  args jsonb not null,
  args_hash text not null,
  -- Pre-assigned id of the record the action creates, so a retried confirm
  -- can never create a second one.
  target_id uuid not null default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'executing', 'executed', 'cancelled', 'failed')),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- ── Usage & audit ───────────────────────────────────────────────────────
create table if not exists ai_usage (
  id bigserial primary key,
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  conversation_id uuid references ai_conversations (id) on delete set null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_day_idx on ai_usage (user_id, created_at);

-- Who did what, without document text or message content.
create table if not exists ai_audit_events (
  id bigserial primary key,
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid references profiles (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  conversation_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists ai_audit_org_idx on ai_audit_events (org_id, created_at desc);

-- ── Row Level Security ──────────────────────────────────────────────────
alter table ai_conversations enable row level security;
alter table ai_messages enable row level security;
alter table ai_files enable row level security;
alter table ai_document_index enable row level security;
alter table ai_chunks enable row level security;
alter table ai_memories enable row level security;
alter table ai_pending_actions enable row level security;
alter table ai_usage enable row level security;
alter table ai_audit_events enable row level security;

drop policy if exists "Own conversations" on ai_conversations;
create policy "Own conversations" on ai_conversations for all
  using (user_id = auth.uid() and org_id = auth_org_id())
  with check (user_id = auth.uid() and org_id = auth_org_id());

drop policy if exists "Messages in own conversations" on ai_messages;
create policy "Messages in own conversations" on ai_messages for all
  using (exists (select 1 from ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()));

drop policy if exists "Own files" on ai_files;
create policy "Own files" on ai_files for all
  using (user_id = auth.uid() and org_id = auth_org_id())
  with check (user_id = auth.uid() and org_id = auth_org_id());

drop policy if exists "Org document index" on ai_document_index;
create policy "Org document index" on ai_document_index for select using (org_id = auth_org_id());

drop policy if exists "Chunks of own files or org documents" on ai_chunks;
create policy "Chunks of own files or org documents" on ai_chunks for select
  using (
    org_id = auth_org_id()
    and (
      version_id is not null
      or exists (select 1 from ai_files f where f.id = file_id and f.user_id = auth.uid())
    )
  );

drop policy if exists "Visible memories" on ai_memories;
create policy "Visible memories" on ai_memories for all
  using (org_id = auth_org_id() and (scope <> 'personal' or user_id = auth.uid()))
  with check (org_id = auth_org_id() and (scope <> 'personal' or user_id = auth.uid()));

drop policy if exists "Own pending actions" on ai_pending_actions;
create policy "Own pending actions" on ai_pending_actions for select using (user_id = auth.uid());

drop policy if exists "Own usage" on ai_usage;
create policy "Own usage" on ai_usage for select using (user_id = auth.uid());

drop policy if exists "Org admins read audit" on ai_audit_events;
create policy "Org admins read audit" on ai_audit_events for select
  using (
    org_id = auth_org_id()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('owner', 'admin'))
  );

-- ── Private bucket for chat attachments ─────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ai-attachments', 'ai-attachments', false, 15728640,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
