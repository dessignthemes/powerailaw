-- 0056: Email signature (Settings → Mail automation).
-- Each person keeps their own signature: formatted text (fonts, sizes, colours,
-- links) plus pictures such as the firm logo. It is added under the message
-- when they send from LawPower, and they can untick it per email.
-- Safe to run more than once.

alter table public.profiles add column if not exists email_signature_html text;
alter table public.profiles add column if not exists email_signature_on boolean not null default true;

-- Pictures used in signatures (logos). Private bucket: the app serves each
-- picture at an unguessable lawpower.ai address so it shows in recipients'
-- mail. 2 MB per picture; PNG, JPG or GIF (formats every mail app shows).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('email-signatures', 'email-signatures', false, 2097152,
        array['image/png', 'image/jpeg', 'image/gif'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
