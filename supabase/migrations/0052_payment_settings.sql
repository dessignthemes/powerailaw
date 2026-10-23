-- 0052: Online payments (LawPay). The firm's LawPay payment page links, shown as
-- "Pay online" on invoices and in the client portal:
--   { "lawpayOperatingUrl": "https://…", "lawpayTrustUrl": "https://…" }
-- Safe to run more than once.

alter table public.organizations add column if not exists payment_settings jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
