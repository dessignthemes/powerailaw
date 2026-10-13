-- 0030: clients can upload files through the client portal. Uploaded files are
-- saved to the matter's Documents (marked as from the client) and attached to
-- the client's secure message. Portal activity records each upload.
-- Safe to run more than once.

alter table public.client_portal_events drop constraint if exists client_portal_events_type_check;
alter table public.client_portal_events add constraint client_portal_events_type_check
  check (type in ('invited', 'joined', 'login', 'viewed', 'downloaded', 'message_read', 'replied', 'uploaded'));

-- Which documents came from the client (shown as "From client").
alter table public.documents add column if not exists from_client boolean not null default false;

notify pgrst, 'reload schema';
