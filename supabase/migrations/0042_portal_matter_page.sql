-- 0042: client portal matter page.
--  * 'portal_message' alerts: a client (or other party) wrote on the portal.
--  * A second, portal-only signing link for a signature request (the emailed link
--    keeps working); only its hash is stored.
-- Safe to run more than once.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('task_assigned', 'matter_assigned', 'task_offered', 'task_accepted', 'portal_message'));

alter table public.signature_requests add column if not exists alt_token_hash text unique;

notify pgrst, 'reload schema';
