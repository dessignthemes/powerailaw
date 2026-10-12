-- 0026: key dates on a matter (contract signed, attorney review completed,
-- deposits, contingencies, closing), read from the matter's documents or
-- entered by hand. Stored as one JSON object:
--   { dates: { "<field>": { date, days, businessDays, from, source, quote, manual } },
--     facts, documents, notes, fingerprint, extractedAt, letter }
-- The app fills the matter's task checklists from these dates and creates the
-- Contingency Dates Letter once attorney review has concluded.
-- Safe to run more than once.

alter table public.matters add column if not exists key_dates jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
