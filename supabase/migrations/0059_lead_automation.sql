-- 0059: Lead automation.
-- Consultations booked with a prospective client (by the firm, or by the
-- prospect right after the intake form), automatic follow-up emails to leads
-- who haven't booked, and an email reminder before the consultation.
-- Safe to run more than once.

alter table public.leads add column if not exists appointment_at timestamptz;
alter table public.leads add column if not exists appointment_end timestamptz;
alter table public.leads add column if not exists appointment_with uuid references public.profiles (id) on delete set null;
alter table public.leads add column if not exists appointment_location text not null default '';
alter table public.leads add column if not exists appointment_event_id text;
alter table public.leads add column if not exists booking_token text;
alter table public.leads add column if not exists followups_sent integer not null default 0;
alter table public.leads add column if not exists last_followup_at timestamptz;
alter table public.leads add column if not exists reminder_sent_at timestamptz;

create index if not exists leads_appointment_idx on public.leads (appointment_at) where appointment_at is not null;
create unique index if not exists leads_booking_token_uidx on public.leads (booking_token) where booking_token is not null;

-- The firm's lead settings: online booking (who, how long, which hours),
-- follow-up emails and reminders. Shape: see src/lib/leads.ts (LeadSettings).
alter table public.organizations add column if not exists lead_settings jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
