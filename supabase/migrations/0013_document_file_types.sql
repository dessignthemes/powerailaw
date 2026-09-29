-- LawPower AI — Documents: store Word and other files, not only PDFs.
-- Safe to run more than once. Run after 0012_time_entries.sql.
--
-- Each version now records its file type. Existing versions are PDFs, so
-- they get 'pdf' by default. Word files can later be converted to PDF; the
-- PDF is saved as a new version and the Word original is kept.

alter table document_versions
  add column if not exists file_type text not null default 'pdf';

alter table document_versions
  add column if not exists mime_type text not null default 'application/pdf';

alter table document_versions drop constraint if exists document_versions_file_type_check;
alter table document_versions
  add constraint document_versions_file_type_check
  check (file_type in (
    'pdf', 'doc', 'docx', 'rtf', 'odt', 'txt',
    'xls', 'xlsx', 'csv', 'ppt', 'pptx',
    'png', 'jpg', 'eml', 'msg'
  ));

create index if not exists documents_org_updated_idx on documents (org_id, updated_at desc);

-- Row-level security is unchanged (enabled in 0003): members only see their
-- own workspace's documents and versions.
alter table documents enable row level security;
alter table document_versions enable row level security;

-- The private bucket now accepts these file types (still 25 MB max, still
-- private: files are only reachable through short-lived signed URLs).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'matter-documents', 'matter-documents', false, 26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/rtf',
    'application/vnd.oasis.opendocument.text',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png',
    'image/jpeg',
    'message/rfc822',
    'application/vnd.ms-outlook'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
