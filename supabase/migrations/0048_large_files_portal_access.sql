-- 0048: Larger files, and which linked matters show in a client's portal.
-- 1. Documents (firm uploads and client-portal uploads) can be up to 100 MB each
--    (was 25 MB). The bucket stays private: files are only reachable through
--    short-lived signed links. Note: Supabase also has a project-wide upload
--    limit (Settings → Storage); it must be at least 100 MB too.
-- 2. matter_contacts.portal_access: a client linked to a matter as a contact
--    (e.g. co-client) sees that matter in their portal only when this is on.
--    Existing co-client links get it; everyone else stays off.
-- Safe to run more than once.

update storage.buckets set file_size_limit = 104857600 where id = 'matter-documents';

alter table public.matter_contacts add column if not exists portal_access boolean not null default false;
update public.matter_contacts set portal_access = true
where client_id is not null and portal_access = false and role ilike '%client%';

notify pgrst, 'reload schema';
