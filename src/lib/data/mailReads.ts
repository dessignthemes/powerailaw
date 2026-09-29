import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MailProvider } from "@/lib/mail/types";

// Emails a person opened in LawPower (the mailbox itself stays read-only).
// Before migration 0016 runs these quietly do nothing, and the Inbox falls
// back to remembering opened emails in the browser.

function missingTable(error: { code?: string; message?: string } | null) {
  return !!error && (error.code === "PGRST205" || error.code === "42P01" || /mail_reads/.test(error.message ?? ""));
}

export async function markMailRead(userId: string, provider: MailProvider, messageId: string) {
  const { error } = await createAdminClient()
    .from("mail_reads")
    .upsert({ user_id: userId, provider, message_id: messageId.slice(0, 500), read_at: new Date().toISOString() }, { onConflict: "user_id,provider,message_id" });
  if (error && !missingTable(error)) console.error("markMailRead failed:", error);
}

export async function readMessageIds(userId: string, provider: MailProvider, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await createAdminClient()
    .from("mail_reads")
    .select("message_id")
    .eq("user_id", userId)
    .eq("provider", provider)
    .in("message_id", ids.slice(0, 200));
  if (error) {
    if (!missingTable(error)) console.error("readMessageIds failed:", error);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.message_id as string));
}
