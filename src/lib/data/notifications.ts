import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailAssignment } from "@/lib/email/assignment";

// The bell's alerts (0035_notifications.sql): someone assigned you a task or a matter.

const db = () => createAdminClient();
const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === "PGRST205" || e.code === "42P01" || /notifications/.test(e.message ?? ""));

export type Notification = {
  id: string;
  kind: "task_assigned" | "matter_assigned" | "task_offered" | "task_accepted" | "portal_message";
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
    const actor = await actorName(opts.actorId);
    const { error } = await db().from("notifications").insert({
      org_id: opts.orgId,
      user_id: target.id,
      kind: opts.kind,
      ref_id: opts.refId,
      board_id: opts.boardId ?? null,
      title: opts.title.slice(0, 300),
      actor_id: opts.actorId,
      actor_name: actor,
    });
    if (error && !missing(error)) console.error("notification insert failed:", error.message);
    // Also by email (task assigned / offered, matter assigned). Never blocks the save.
    await emailAssignment({ orgId: opts.orgId, toUserId: target.id, kind: opts.kind, refId: opts.refId, title: opts.title, actorName: actor }).catch((e) => console.error("assignment email failed:", e));
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


// A client (or other party) wrote on the client portal: alert the matter's assigned
// person, or the firm owner(s) when nobody is assigned. Never throws.
// ref_id is the matter; for a message not tied to a matter it is the client (board_id = client id).
export async function notifyPortalMessage(opts: { orgId: string; matterId: string | null; clientId: string; fromName: string; preview: string }) {
  try {
    let title = opts.preview.slice(0, 120) || "Sent files";
    let assigned: string | null = null;
    if (opts.matterId) {
      const { data: m } = await db().from("matters").select("title, assigned_to").eq("id", opts.matterId).eq("org_id", opts.orgId).maybeSingle();
      assigned = (m?.assigned_to as string | null) ?? null;
      if (m?.title) title = `${m.title}: ${title}`.slice(0, 300);
    }
    let to: string[] = assigned ? [assigned] : [];
    if (!to.length) {
      const { data: owners } = await db().from("profiles").select("id").eq("org_id", opts.orgId).eq("role", "owner");
      to = ((owners ?? []) as { id: string }[]).map((o) => o.id);
    }
    if (!to.length) return;
    const { error } = await db()
      .from("notifications")
      .insert(
        to.map((uid) => ({
          org_id: opts.orgId,
          user_id: uid,
          kind: "portal_message",
          ref_id: opts.matterId ?? opts.clientId,
          board_id: opts.matterId ? null : opts.clientId,
          title,
          actor_id: null,
          actor_name: opts.fromName.slice(0, 120),
        }))
      );
    if (error && !missing(error)) console.error("portal message alert failed:", error.message);
  } catch (e) {
    console.error("notifyPortalMessage failed:", e);
  }
}
