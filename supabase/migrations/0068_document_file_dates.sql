-- When a file was last changed on the computer it was uploaded from (the
-- "Date modified" in File Explorer / Finder). Kept so key dates can tell when
-- a letter was really initialled and returned, not just when it was uploaded.
-- Safe to run more than once.
alter table document_versions add column if not exists file_modified_at timestamptz;

notify pgrst, 'reload schema';
