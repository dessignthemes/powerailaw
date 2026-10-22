-- 0051: Firm-wide email notification settings (Administration → Email notifications).
--   { "digest": true, "digestHour": 9, "digestDays": "weekdays" | "daily", "assignEmails": true }
-- Each person's own on/off for the morning check-in stays in profiles.daily_digest (0050).
-- Safe to run more than once.

alter table public.organizations add column if not exists notification_settings jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
