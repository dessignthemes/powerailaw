import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { canSeeTask } from "@/lib/data/tasks";
import { cleanChecklist } from "@/lib/checklist";

// What everyone in the firm did, newest first: for a matter's Activities tab and
// the Dashboard's Recent activity widget (the same items, so clicking one on the
// Dashboard opens it in the matter). Gathered from what LawPower already keeps:
// tasks (created / updated / completed, workflow steps ticked), documents and
// their versions, time logged, emails sent from LawPower, the matter's status,
// key dates read and the contingency letter.

const db = () => createAdminClient();

export type ActivityItem = {
  id: string;
  at: string;
  kind: "task" | "step" | "document" | "time" | "email" | "status" | "matter" | "keydates";
  verb: string; // "Completed task", "Added document"…
  subject: string; // the task title, file name…
  actorId: string | null;
  actorEmail: string | null;
  matterId: string | null;
  matterNumber: string | null;
  matterTitle: string | null;
  taskId: string | null;
  documentId: string | null;
};

export async function activity(orgId: string, me: { id: string; email: string | null }, opts: { matterId?: string | null; limit?: number }): Promise<ActivityItem[]> {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 40));
  const since = new Date(Date.now() - (opts.matterId ? 3650 : 120) * 86_400_000).toISOString();
  const mid = opts.matterId ?? null;
  const mq = db().from("matters").select("*").eq("org_id", orgId);
  const tq = db().from("tasks").select("*").eq("org_id", orgId).gte("updated_at", since);
  const dq = db()
    .from("documents")
    .select("id, title, matter_id, created_at, document_versions(id, version_number, note, created_by, created_by_email, created_at)")
    .eq("org_id", orgId)
    .gte("updated_at", since);
  const eq = db().from("time_entries").select("id, user_id, minutes, description, matter_id, created_at").eq("org_id", orgId).gte("created_at", since);
  const fq = db().from("mail_followups").select("id, user_id, subject, to_email, matter_id, sent_at").eq("org_id", orgId).gte("sent_at", since);
  const [mattersR, tasksR, docsR, timeR, mailR] = await Promise.all([
    (mid ? mq.eq("id", mid) : mq).limit(mid ? 1 : 2000),
    (mid ? tq.eq("matter_id", mid) : tq).order("updated_at", { ascending: false }).limit(400),
    (mid ? dq.eq("matter_id", mid) : dq).limit(400),
    (mid ? eq.eq("matter_id", mid) : eq).order("created_at", { ascending: false }).limit(200),
    (mid ? fq.eq("matter_id", mid) : fq).limit(200),
  ]);
  type M = { id: string; title: string; matter_number?: string | null; status: string; created_at: string; status_changed_at?: string | null; key_dates?: { extractedAt?: string | null; read?: unknown; letter?: { generatedAt?: string | null } | null } | null };
  const matters = (mattersR.data ?? []) as M[];
  const byId = new Map(matters.map((m) => [m.id, m]));
  const mref = (id: string | null | undefined) => {
    const m = id ? byId.get(id) : undefined;
    return { matterId: id ?? null, matterNumber: m?.matter_number ?? null, matterTitle: m?.title ?? null };
  };
  const out: ActivityItem[] = [];
  const push = (x: Omit<ActivityItem, "matterNumber" | "matterTitle" | "taskId" | "documentId" | "actorEmail"> & Partial<ActivityItem>) =>
    out.push({ taskId: null, documentId: null, actorEmail: null, ...mref(x.matterId), ...x } as ActivityItem);

  // Matters: opened, status changes, key dates read, the letter.
  for (const m of matters) {
    if (opts.matterId || m.created_at >= since) push({ id: `matter:${m.id}`, at: m.created_at, kind: "matter", verb: "Opened matter", subject: m.title, actorId: null, matterId: m.id });
    if (m.status_changed_at && m.status_changed_at >= since) push({ id: `status:${m.id}:${m.status_changed_at}`, at: m.status_changed_at, kind: "status", verb: "Status changed to", subject: m.status, actorId: null, matterId: m.id });
    const kd = m.key_dates;
    if (kd?.extractedAt && kd.extractedAt >= since) push({ id: `keydates:${m.id}:${kd.extractedAt}`, at: kd.extractedAt, kind: "keydates", verb: "Key dates read from the documents", subject: "", actorId: null, matterId: m.id });
    if (kd?.letter?.generatedAt && kd.letter.generatedAt >= since) push({ id: `letter:${m.id}:${kd.letter.generatedAt}`, at: kd.letter.generatedAt, kind: "document", verb: "Contingency dates letter created", subject: "", actorId: null, matterId: m.id });
  }

  // Tasks and workflow steps (private tasks only for the people they belong to).
  type T = { id: string; title: string; status: string; matter_id: string | null; created_at: string; updated_at?: string | null; created_by?: string | null; updated_by?: string | null; checklist?: unknown; is_private?: boolean | null; assignee?: string | null; assigned_by?: string | null; offered_to?: string[] | null };
  for (const t of (tasksR.data ?? []) as T[]) {
    if (!canSeeTask(t, me)) continue;
    if (t.created_at >= since) push({ id: `task:${t.id}:c`, at: t.created_at, kind: "task", verb: "Created task", subject: t.title, actorId: t.created_by ?? null, matterId: t.matter_id, taskId: t.id });
    const upd = t.updated_at && Math.abs(Date.parse(t.updated_at) - Date.parse(t.created_at)) > 2000 ? t.updated_at : null;
    if (upd) push({ id: `task:${t.id}:u`, at: upd, kind: "task", verb: t.status === "done" ? "Completed task" : "Updated task", subject: t.title, actorId: t.updated_by ?? t.created_by ?? null, matterId: t.matter_id, taskId: t.id });
    const c = cleanChecklist(t.checklist);
    for (const s of c?.sections ?? [])
      for (const i of s.items)
        if (i.done && i.doneAt && i.doneAt >= since)
          push({ id: `step:${t.id}:${i.id}`, at: i.doneAt, kind: "step", verb: "Ticked step", subject: i.text, actorId: null, matterId: t.matter_id, taskId: t.id });
  }

  // Documents and their versions.
  type D = { id: string; title: string; matter_id: string | null; document_versions?: { id: string; version_number: number; note: string | null; created_by?: string | null; created_by_email?: string | null; created_at: string }[] };
  for (const d of (docsR.data ?? []) as D[])
    for (const v of d.document_versions ?? [])
      if (v.created_at >= since)
        push({
          id: `doc:${d.id}:${v.id}`,
          at: v.created_at,
          kind: "document",
          verb: v.version_number <= 1 ? "Added document" : `Saved version ${v.version_number} of`,
          subject: d.title,
          actorId: v.created_by ?? null,
          actorEmail: v.created_by_email ?? null,
          matterId: d.matter_id,
          documentId: d.id,
        });

  // Time logged.
  for (const e of (timeR.data ?? []) as { id: string; user_id: string; minutes: number; description: string; matter_id: string | null; created_at: string }[]) {
    const h = e.minutes >= 60 ? `${(e.minutes / 60).toFixed(1).replace(/\.0$/, "")} h` : `${e.minutes} min`;
    push({ id: `time:${e.id}`, at: e.created_at, kind: "time", verb: `Logged ${h}`, subject: e.description || "time", actorId: e.user_id, matterId: e.matter_id });
  }

  // Emails sent from LawPower that asked for something (the follow-up reminders).
  for (const f of (mailR.data ?? []) as { id: string; user_id: string; subject: string; to_email: string; matter_id: string | null; sent_at: string }[])
    push({ id: `mail:${f.id}`, at: f.sent_at, kind: "email", verb: `Emailed ${f.to_email.split(",")[0]}:`, subject: f.subject, actorId: f.user_id, matterId: f.matter_id });

  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
