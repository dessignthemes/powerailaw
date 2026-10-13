-- 0034: clients can complete their intake sheet in the client portal.
-- Their edits go straight into the client card; portal activity records them.
-- Safe to run more than once.

alter table public.client_portal_events drop constraint if exists client_portal_events_type_check;
alter table public.client_portal_events add constraint client_portal_events_type_check
  check (type in ('invited', 'joined', 'login', 'viewed', 'downloaded', 'message_read', 'replied', 'uploaded', 'intake_updated'));

notify pgrst, 'reload schema';
