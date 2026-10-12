-- 0028: matter details (parties, property, contract figures) per matter type.
-- { "<field>": { "value": "...", "source": "document title", "manual": true } }
-- Filled by hand or by the AI from the matter's documents.
-- Safe to run more than once.

alter table public.matters add column if not exists details jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
