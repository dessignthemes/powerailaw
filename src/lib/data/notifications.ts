import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// The bell's alerts (0035_notifications.sql): someone assigned you a task or a matter.

const db = () => createAdminClient();
const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === "PGRST205" || e.code === "42P01" || /notifications/.test(e.message ?? ""));

export type Notification = {
  id: string;
  kind: "task_assigned" | "matter_assigned" | "task_offered" | "task_accepted";
  refId: string;
  boardId: string | null;
  title: string;
  actorName: string;
  createdAt: string;
  read: boolean;
};

async function profileByEmail(orgId: string, email: string) {
  const { data } = await db().from("profiles").select("id, email").eq("org_id", orgId).ilike("email", email.trim()).maybeSingle();
  return data as { id: string; email: string } | null;
}

async function actorName(actorId: string | null) {
  if (!actorId) return "Someone";
  const { data } = await db().from("profiles").select("full_name, email").eq("id", actorId).maybeSingle();
  const p = data as { full_name?: string | null; email?: string } | null;
  return (p?.full_name || p?.email || "Someone").slice(0, 120);
}

// Alerts the new assignee (not when people assign things to themselves). Never throws:
// an alert that can't be saved must not stop the task or matter from saving.
export async function notifyAssigned(opts: {
  orgId: string;
  actorId: string | null;
  kind: Notification["kind"];
  refId: string;
  boardId?: string | null;
  title: string;
  to: string | null | undefined; // email (tasks) or profile id (matters)
  before?: string | null;
}) {
  try {
    if (!opts.to || opts.to === opts.before) return;
    const target = /^[0-9a-f-]{36}$/i.test(opts.to) ? { id: opts.to } : await profileByEmail(opts.orgId, opts.to);
    if (!target || target.id === opts.actorId) return;
    const { error } = await db().from("notifications").insert({
      org_id: opts.orgId,
      user_id: target.id,
      kind: opts.kind,
      ref_id: opts.refId,
      board_id: opts.boardId ?? null,
      title: opts.title.slice(0, 300),
      actor_id: opts.actorId,
      actor_name: await actorName(opts.actorId),
    });
    if (error && !missing(error)) console.error("notification insert failed:", error.message);
  } catch (e) {
    console.error("notifyAssigned failed:", e);
  }
}

export async function listNotifications(orgId: string, userId: string): Promise<{ items: Notification[]; unread: number }> {
  const { data, error } = await db().from("notifications").select("*").eq("org_id", orgId).eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
  if (error) {
    if (missing(error)) return { items: [], unread: 0 }; // not set up yet: no bell alerts
    throw error;
  }
  const items = ((data ?? []) as { id: string; kind: Notification["kind"]; ref_id: string; board_id: string | null; title: string; actor_name: string; created_at: string; read_at: string | null }[]).map(
    (n) => ({ id: n.id, kind: n.kind, refId: n.ref_id, boardId: n.board_id, title: n.title, actorName: n.actor_name, createdAt: n.created_at, read: !!n.read_at })
  );
  return { items, unread: items.filter((n) => !n.read).length };
}

export async function markAllRead(orgId: string, userId: string) {
  const { error } = await db().from("notifications").update({ read_at: new Date().toISOString() }).eq("org_id", orgId).eq("user_id", userId).is("read_at", null);
  if (error && !missing(error)) throw error;
}
