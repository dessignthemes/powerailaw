-- 0033: which key dates each matter type shows, per firm (renamed, removed or
-- added fields). { "<matter type>": [ { "key": "...", "label": "..." } ] }
-- Empty = the standard fields. Safe to run more than once.

alter table public.organizations add column if not exists key_date_layouts jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
