import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessToken } from "@/lib/mail/tokens";
import { askedFor, nextBusinessDay } from "@/lib/mail/followUp";
import { firmTimezone, todayIn } from "@/lib/ai/workspaceTools";
import type { MailProvider } from "@/lib/mail/types";

// Email follow-up reminders (migration 0070): an email sent from LawPower that
// asks the recipient for something gets a reminder for the next business day.
// It closes by itself when the recipient replies (the inbox is checked when
// the reminders are looked at), or when the person ticks it done.

const db = () => createAdminClient();

export type FollowUp = {
  id: string;
  toEmail: string;
  subject: string;
  reason: string;
  matterId: string | null;
  sentAt: string;
  remindOn: string;
  status: "open" | "done" | "replied" | "dismissed";
  doneAt: string | null;
};
type Row = {
  id: string;
  provider: string;
  to_email: string;
  subject: string;
  reason: string;
  matter_id: string | null;
  sent_at: string;
  remind_on: string;
  status: FollowUp["status"];
  done_at: string | null;
  checked_at: string | null;
};
const toFollowUp = (r: Row): FollowUp => ({
  id: r.id,
  toEmail: r.to_email,
  subject: r.subject,
  reason: r.reason,
  matterId: r.matter_id,
  sentAt: r.sent_at,
  remindOn: r.remind_on,
  status: r.status,
  doneAt: r.done_at,
});

// After an email is sent: a reminder when it asks for something. Never fails the send.
export async function maybeRemember(opts: {
  orgId: string;
  userId: string;
  provider: string;
  to: string[];
  subject: string;
  text: string;
}): Promise<{ id: string; remindOn: string; reason: string } | null> {
  try {
    const reason = askedFor(opts.text);
    if (!reason || !opts.to.length) return null;
    const today = todayIn(await firmTimezone(opts.orgId)).ymd;
    const remindOn = nextBusinessDay(today);
    // The matter, from a matter number in the subject (e.g. "… [REP-2026-3718]").
    const num = opts.subject.toUpperCase().match(/\b[A-Z][A-Z0-9]{0,7}-\d{4}-\d+\b/)?.[0];
    let matterId: string | null = null;
    if (num) {
      const { data } = await db().from("matters").select("id").eq("org_id", opts.orgId).eq("matter_number", num).limit(1);
      matterId = (data?.[0] as { id?: string } | undefined)?.id ?? null;
    }
    const { data, error } = await db()
      .from("mail_followups")
      .insert({
        org_id: opts.orgId,
        user_id: opts.userId,
        provider: opts.provider,
        to_email: opts.to.join(", ").slice(0, 500),
        subject: opts.subject.slice(0, 300),
        reason,
        matter_id: matterId,
        remind_on: remindOn,
      })
      .select("id")
      .single();
    if (error) return null; // 0070 not run yet
    return { id: (data as { id: string }).id, remindOn, reason };
  } catch {
    return null;
  }
}

// Has anyone in `to` written back since the email was sent?
async function replied(userId: string, provider: string, to: string, since: string): Promise<boolean | null> {
  const emails = to
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@'"]+@[^\s@'"]+\.[^\s@'"]+$/.test(e))
    .slice(0, 5);
  if (!emails.length || (provider !== "microsoft" && provider !== "google")) return null;
  try {
    const { token } = await getAccessToken(userId, provider as MailProvider);
    for (const e of emails) {
      if (provider === "microsoft") {
        const filter = encodeURIComponent(`receivedDateTime ge ${new Date(since).toISOString()} and from/emailAddress/address eq '${e}'`);
        const r = await fetch(`https://graph.microsoft.com/v1.0/me/messages?$filter=${filter}&$orderby=receivedDateTime desc&$top=1&$select=id`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) return null;
        if (((await r.json()) as { value?: unknown[] }).value?.length) return true;
      } else {
        const q = encodeURIComponent(`from:${e} after:${Math.floor(new Date(since).getTime() / 1000)}`);
        const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=1`, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) return null;
        if (((await r.json()) as { messages?: unknown[] }).messages?.length) return true;
      }
    }
    return false;
  } catch {
    return null;
  }
}

// The person's open reminders (and ones closed in the last 3 days, to show what
// happened). Open ones are checked against the inbox at most every 20 minutes.
export async function listFollowUps(orgId: string, userId: string): Promise<{ items: FollowUp[]; setupRequired?: boolean }> {
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const { data, error } = await db()
    .from("mail_followups")
    .select("*")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .or(`status.eq.open,done_at.gte.${since}`)
    .order("remind_on")
    .limit(100);
  if (error) return { items: [], setupRequired: true };
  const rows = (data ?? []) as Row[];
  const stale = rows.filter((r) => r.status === "open" && (!r.checked_at || Date.now() - Date.parse(r.checked_at) > 20 * 60_000)).slice(0, 12);
  await Promise.all(
    stale.map(async (r) => {
      const got = await replied(userId, r.provider, r.to_email, r.sent_at);
      const now = new Date().toISOString();
      const patch = got ? { status: "replied" as const, done_at: now, checked_at: now } : { checked_at: now };
      await db().from("mail_followups").update(patch).eq("id", r.id).eq("org_id", orgId);
      Object.assign(r, patch);
    })
  );
  return { items: rows.map(toFollowUp) };
}

// done | dismiss | snooze (next business day) | reopen
export async function updateFollowUp(orgId: string, userId: string, id: string, action: string): Promise<FollowUp | null> {
  const { data: cur } = await db().from("mail_followups").select("*").eq("id", id).eq("org_id", orgId).eq("user_id", userId).maybeSingle();
  if (!cur) return null;
  const now = new Date().toISOString();
  const today = todayIn(await firmTimezone(orgId)).ymd;
  const patch =
    action === "done"
      ? { status: "done", done_at: now }
      : action === "dismiss"
        ? { status: "dismissed", done_at: now }
        : action === "snooze"
          ? { remind_on: nextBusinessDay(today), status: "open", done_at: null }
          : action === "reopen"
            ? { status: "open", done_at: null }
            : null;
  if (!patch) return toFollowUp(cur as Row);
  const { data } = await db().from("mail_followups").update(patch).eq("id", id).eq("org_id", orgId).select("*").single();
  return data ? toFollowUp(data as Row) : null;
}
