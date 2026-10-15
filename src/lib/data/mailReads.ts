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

// ── Marks: flagged as important / marked unread (0037_mail_marks.sql) ─────────

const marksMissing = (e: { code?: string; message?: string } | null) => !!e && (e.code === "PGRST205" || e.code === "42P01" || /mail_marks/.test(e.message ?? ""));

export class MailMarkError extends Error {
  status = 503 as const;
}

export async function setMailMark(userId: string, provider: MailProvider, messageId: string, mark: { flagged?: boolean; unread?: boolean }) {
  const db = createAdminClient();
  const id = messageId.slice(0, 500);
  const { data: current } = await db.from("mail_marks").select("flagged, unread").eq("user_id", userId).eq("provider", provider).eq("message_id", id).maybeSingle();
  const row = {
    user_id: userId,
    provider,
    message_id: id,
    flagged: mark.flagged ?? (current?.flagged as boolean | undefined) ?? false,
    unread: mark.unread ?? (current?.unread as boolean | undefined) ?? false,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("mail_marks").upsert(row, { onConflict: "user_id,provider,message_id" });
  if (error) {
    if (marksMissing(error)) throw new MailMarkError("Flags need a database update: run supabase/migrations/0037_mail_marks.sql in the Supabase SQL editor.");
    throw error;
  }
  // "Mark as unread" also forgets that it was opened in LawPower.
  if (mark.unread) await db.from("mail_reads").delete().eq("user_id", userId).eq("provider", provider).eq("message_id", id);
  return { flagged: row.flagged, unread: row.unread };
}

// Opening an email clears its "marked unread".
export async function clearUnreadMark(userId: string, provider: MailProvider, messageId: string) {
  const { error } = await createAdminClient().from("mail_marks").update({ unread: false }).eq("user_id", userId).eq("provider", provider).eq("message_id", messageId.slice(0, 500)).eq("unread", true);
  if (error && !marksMissing(error)) console.error("clearUnreadMark failed:", error);
}

export async function mailMarks(userId: string, provider: MailProvider, ids: string[]): Promise<Map<string, { flagged: boolean; unread: boolean }>> {
  if (!ids.length) return new Map();
  const { data, error } = await createAdminClient().from("mail_marks").select("message_id, flagged, unread").eq("user_id", userId).eq("provider", provider).in("message_id", ids.slice(0, 200));
  if (error) {
    if (!marksMissing(error)) console.error("mailMarks failed:", error);
    return new Map();
  }
  return new Map((data ?? []).map((r) => [r.message_id as string, { flagged: !!r.flagged, unread: !!r.unread }]));
}

// When read / unread lives in the mailbox itself, LawPower's own "opened" note is dropped.
export async function forgetRead(userId: string, provider: MailProvider, messageId: string) {
  const { error } = await createAdminClient().from("mail_reads").delete().eq("user_id", userId).eq("provider", provider).eq("message_id", messageId.slice(0, 500));
  if (error && !missingTable(error)) console.error("forgetRead failed:", error);
}
