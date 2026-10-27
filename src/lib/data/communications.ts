import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTaskRow } from "@/lib/data/tasks";
import type { BoardTask, TaskPriority } from "@/components/NewTaskModal";

// Communications: phone call logs (a call back becomes a task, tagged to the
// matter) and internal messages between colleagues; plus firm-wide lists of
// emails / texts filed to matters.

export class CommError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string
  ) {
    super(message);
  }
}

const db = () => createAdminClient();
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
function check<T>(r: { data: T; error: { code?: string; message?: string } | null }): T {
  if (r.error) {
    if (r.error.code === "42P01" || r.error.code === "PGRST205" || /communications/.test(r.error.message ?? ""))
      throw new CommError("Communications needs a database update. Run supabase/migrations/0053_communications.sql in the Supabase SQL editor, then refresh.", 503, "setup_required");
    throw r.error;
  }
  return r.data;
}

export type Comm = {
  id: string;
  kind: "call" | "internal";
  direction: "in" | "out" | "";
  contactName: string;
  contactPhone: string;
  clientId: string | null;
  matter: { id: string; number: string | null; title: string } | null;
  subject: string;
  body: string;
  occurredAt: string;
  durationMin: number | null;
  callbackNeeded: boolean;
  callbackDoneAt: string | null;
  taskId: string | null;
  recipients: { id: string; name: string }[];
  createdBy: { id: string; name: string } | null;
};

type Row = {
  id: string; kind: Comm["kind"]; direction: Comm["direction"]; contact_name: string; contact_phone: string; client_id: string | null; matter_id: string | null;
  subject: string; body: string; occurred_at: string; duration_min: number | null; callback_needed: boolean; callback_done_at: string | null; task_id: string | null;
  recipients: string[] | null; created_by: string | null;
};

async function describe(orgId: string, rows: Row[]): Promise<Comm[]> {
  const matterIds = [...new Set(rows.map((r) => r.matter_id).filter(Boolean))] as string[];
  const people = [...new Set(rows.flatMap((r) => [r.created_by, ...(r.recipients ?? [])]).filter(Boolean))] as string[];
  const [{ data: ms }, { data: ps }] = await Promise.all([
    matterIds.length ? db().from("matters").select("id, title, matter_number").eq("org_id", orgId).in("id", matterIds) : Promise.resolve({ data: [] }),
    people.length ? db().from("profiles").select("id, full_name, email").in("id", people) : Promise.resolve({ data: [] }),
  ]);
  const matters = new Map(((ms ?? []) as { id: string; title: string; matter_number: string | null }[]).map((m) => [m.id, m]));
  const names = new Map(((ps ?? []) as { id: string; full_name: string | null; email: string }[]).map((p) => [p.id, p.full_name || p.email]));
  return rows.map((r) => {
    const m = r.matter_id ? matters.get(r.matter_id) : null;
    return {
      id: r.id, kind: r.kind, direction: r.direction, contactName: r.contact_name, contactPhone: r.contact_phone, clientId: r.client_id,
      matter: m ? { id: m.id, number: m.matter_number, title: m.title } : null,
      subject: r.subject, body: r.body, occurredAt: r.occurred_at, durationMin: r.duration_min, callbackNeeded: r.callback_needed,
      callbackDoneAt: r.callback_done_at, taskId: r.task_id,
      recipients: (r.recipients ?? []).map((id) => ({ id, name: names.get(id) ?? "Colleague" })),
      createdBy: r.created_by ? { id: r.created_by, name: names.get(r.created_by) ?? "Someone" } : null,
    };
  });
}

export async function listComms(orgId: string, userId: string, kind: "call" | "internal", opts: { matterId?: string | null } = {}) {
  let q = db().from("communications").select("*").eq("org_id", orgId).eq("kind", kind).order("occurred_at", { ascending: false }).limit(300);
  if (isId(opts.matterId)) q = q.eq("matter_id", opts.matterId);
  // Internal messages: the ones I wrote or was sent.
  if (kind === "internal") q = q.or(`created_by.eq.${userId},recipients.cs.{${userId}}`);
  return describe(orgId, check(await q) as Row[]);
}

async function matterInOrg(orgId: string, matterId: unknown) {
  if (!isId(matterId)) return null;
  const { data } = await db().from("matters").select("id, title, matter_number, client_id").eq("org_id", orgId).eq("id", matterId).maybeSingle();
  return data as { id: string; title: string; matter_number: string | null; client_id: string | null } | null;
}

// A phone call. "Needs a call back" creates a task (tagged to the matter) for whoever should call.
export async function logCall(
  orgId: string,
  userId: string,
  b: { direction?: unknown; contactName?: unknown; contactPhone?: unknown; clientId?: unknown; matterId?: unknown; subject?: unknown; body?: unknown; occurredAt?: unknown; durationMin?: unknown; callback?: { needed?: unknown; assignee?: unknown; dueDate?: unknown; priority?: unknown } }
) {
  const contactName = clip(b.contactName, 200);
  if (!contactName && !clip(b.contactPhone, 60)) throw new CommError("Add who called (a name or a phone number).");
  const matter = await matterInOrg(orgId, b.matterId);
  const occurred = typeof b.occurredAt === "string" && !Number.isNaN(Date.parse(b.occurredAt)) ? new Date(b.occurredAt).toISOString() : new Date().toISOString();
  const dur = Number(b.durationMin);
  const needed = b.callback?.needed === true;
  const row = check(
    await db()
      .from("communications")
      .insert({
        org_id: orgId, kind: "call", direction: b.direction === "out" ? "out" : "in", contact_name: contactName, contact_phone: clip(b.contactPhone, 60),
        client_id: isId(b.clientId) ? b.clientId : matter?.client_id ?? null, matter_id: matter?.id ?? null, subject: clip(b.subject, 300), body: clip(b.body, 5000),
        occurred_at: occurred, duration_min: Number.isFinite(dur) && dur > 0 ? Math.min(1440, Math.round(dur)) : null, callback_needed: needed, created_by: userId,
      })
      .select("*")
      .single()
  ) as Row;

  if (needed) {
    const who = contactName || clip(b.contactPhone, 60);
    const phone = clip(b.contactPhone, 60);
    const priority: TaskPriority = b.callback?.priority === "High" || b.callback?.priority === "Low" ? (b.callback.priority as TaskPriority) : "Medium";
    const due = typeof b.callback?.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.callback.dueDate) ? b.callback.dueDate : new Date().toISOString().slice(0, 10);
    const notes = clip(b.body, 2000);
    const task: BoardTask = {
      id: crypto.randomUUID(),
      title: `Call back ${who}${matter?.matter_number ? ` · ${matter.matter_number}` : ""}`.slice(0, 200),
      description: [phone ? `Phone: ${phone}` : "", clip(b.subject, 300) ? `About: ${clip(b.subject, 300)}` : "", notes ? `Notes: ${notes}` : "", `Call logged ${new Date(occurred).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`]
        .filter(Boolean)
        .join("\n"),
      status: "todo",
      priority,
      assignee: typeof b.callback?.assignee === "string" && b.callback.assignee.includes("@") ? b.callback.assignee.slice(0, 320) : null,
      dueDate: due,
      matterId: matter?.id ?? null,
    };
    const created = await createTaskRow(task, userId);
    await db().from("communications").update({ task_id: created.id }).eq("id", row.id);
    row.task_id = created.id;
  }
  return (await describe(orgId, [row]))[0];
}

// Called back: the call log is ticked off and its task is done.
export async function markCalledBack(orgId: string, id: string, done: boolean) {
  const r = check(await db().from("communications").select("id, task_id").eq("org_id", orgId).eq("id", id).maybeSingle()) as { id: string; task_id: string | null } | null;
  if (!r) throw new CommError("That call wasn't found.", 404);
  check(await db().from("communications").update({ callback_done_at: done ? new Date().toISOString() : null }).eq("id", id));
  if (r.task_id) await db().from("tasks").update({ status: done ? "done" : "todo" }).eq("org_id", orgId).eq("id", r.task_id);
}

export async function deleteComm(orgId: string, id: string) {
  check(await db().from("communications").delete().eq("org_id", orgId).eq("id", id));
}

// An internal message to colleagues (optionally about a matter); they get an alert.
export async function sendInternal(orgId: string, userId: string, b: { body?: unknown; subject?: unknown; matterId?: unknown; recipients?: unknown }) {
  const body = clip(b.body, 5000);
  if (!body) throw new CommError("Write the message.");
  const ids = (Array.isArray(b.recipients) ? b.recipients : []).filter(isId).slice(0, 50);
  if (!ids.length) throw new CommError("Pick at least one colleague.");
  const { data: members } = await db().from("profiles").select("id, full_name, email").eq("org_id", orgId).in("id", ids);
  const to = ((members ?? []) as { id: string; full_name: string | null; email: string }[]).filter((m) => m.id !== userId);
  if (!to.length) throw new CommError("Pick at least one colleague.");
  const matter = await matterInOrg(orgId, b.matterId);
  const row = check(
    await db()
      .from("communications")
      .insert({ org_id: orgId, kind: "internal", subject: clip(b.subject, 300), body, matter_id: matter?.id ?? null, client_id: matter?.client_id ?? null, recipients: to.map((m) => m.id), created_by: userId })
      .select("*")
      .single()
  ) as Row;
  const { data: me } = await db().from("profiles").select("full_name, email").eq("id", userId).maybeSingle();
  const actor = (me as { full_name?: string | null; email?: string } | null)?.full_name || (me as { email?: string } | null)?.email || "A colleague";
  const title = `${matter?.matter_number ? `${matter.matter_number}: ` : ""}${body.replace(/\s+/g, " ").slice(0, 140)}`;
  await db()
    .from("notifications")
    .insert(to.map((m) => ({ org_id: orgId, user_id: m.id, kind: "internal_message", ref_id: row.id, title, actor_id: userId, actor_name: actor })))
    .then(() => undefined, () => undefined);
  return (await describe(orgId, [row]))[0];
}

// Emails or texts filed to matters, across the firm (newest first).
export async function filedMessages(orgId: string, channel: "email" | "sms") {
  const { data, error } = await db()
    .from("matter_messages")
    .select("id, matter_id, direction, subject, from_name, from_email, to_text, sent_at, snippet")
    .eq("org_id", orgId)
    .eq("channel", channel)
    .order("sent_at", { ascending: false })
    .limit(200);
  if (error) return [];
  const rows = (data ?? []) as { id: string; matter_id: string; direction: "in" | "out"; subject: string; from_name: string; from_email: string; to_text: string; sent_at: string; snippet: string }[];
  const ids = [...new Set(rows.map((r) => r.matter_id))];
  const { data: ms } = ids.length ? await db().from("matters").select("id, title, matter_number").in("id", ids) : { data: [] };
  const matters = new Map(((ms ?? []) as { id: string; title: string; matter_number: string | null }[]).map((m) => [m.id, m]));
  return rows.map((r) => ({
    id: r.id, direction: r.direction, subject: r.subject, from: r.from_name || r.from_email, to: r.to_text, at: r.sent_at, snippet: r.snippet,
    matter: matters.get(r.matter_id) ? { id: r.matter_id, number: matters.get(r.matter_id)!.matter_number, title: matters.get(r.matter_id)!.title } : null,
  }));
}
