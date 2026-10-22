import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// The firm's email notification settings (Administration → Email notifications).
export type NotificationSettings = {
  digest: boolean; // morning check-in on for the firm
  digestHour: number; // local hour, 6–11
  digestDays: "weekdays" | "daily";
  assignEmails: boolean; // email people when a task / matter is assigned to them
};

export const DEFAULT_SETTINGS: NotificationSettings = { digest: true, digestHour: 9, digestDays: "weekdays", assignEmails: true };

export function cleanSettings(raw: unknown): NotificationSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const hour = Number(r.digestHour);
  return {
    digest: r.digest !== false,
    digestHour: Number.isInteger(hour) && hour >= 6 && hour <= 11 ? hour : DEFAULT_SETTINGS.digestHour,
    digestDays: r.digestDays === "daily" ? "daily" : "weekdays",
    assignEmails: r.assignEmails !== false,
  };
}

export async function getNotificationSettings(orgId: string): Promise<NotificationSettings> {
  const { data, error } = await createAdminClient().from("organizations").select("notification_settings").eq("id", orgId).maybeSingle();
  if (error) return DEFAULT_SETTINGS; // before migration 0051
  return cleanSettings((data as { notification_settings?: unknown } | null)?.notification_settings);
}
