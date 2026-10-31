-- 0066: Dashboard widgets. Each person's own layout (which widgets, their
-- order and size) so it follows them to any computer.
-- Safe to run more than once.

alter table public.profiles add column if not exists dashboard_layout jsonb;

notify pgrst, 'reload schema';
