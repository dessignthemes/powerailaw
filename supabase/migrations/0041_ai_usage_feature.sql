-- 0041: which feature each AI request was for (chat, documents, matter review,
-- accounting), so Administration > AI usage can show where the firm's AI went.
-- Safe to run more than once.

alter table public.ai_usage add column if not exists feature text not null default 'chat';
alter table public.ai_usage drop constraint if exists ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in ('chat', 'documents', 'matter_review', 'accounting', 'other'));
create index if not exists ai_usage_org_month_idx on public.ai_usage (org_id, created_at);

notify pgrst, 'reload schema';
