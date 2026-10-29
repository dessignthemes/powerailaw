-- 0055: "Reset today's limit" (Administration → AI usage). The per-person daily AI
-- limit counts usage from the later of midnight UTC and this moment. Nothing is
-- deleted, so the monthly usage history stays complete.
-- Safe to run more than once.

alter table public.profiles add column if not exists ai_limit_reset_at timestamptz;

notify pgrst, 'reload schema';
