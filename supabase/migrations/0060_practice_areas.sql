-- 0060: Practice areas (Settings → General): which areas of law the firm
-- handles and doesn't, plus private scope notes.
-- Shape: { "areas": { "Real Estate": "handle", "Family Law": "decline" }, "notes": "..." }
-- Safe to run more than once.

alter table public.organizations add column if not exists practice_areas jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
