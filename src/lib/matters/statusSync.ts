import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanChecklist, type TaskChecklist } from "@/lib/checklist";

// The matter's status and its workflow card stay in step, both ways:
//  • Workflow → status: ticking "File Completed" (or every step) closes the matter;
//    ticking "Not Proceeding" sets it to Not proceeding. Unticking undoes it.
//  • Status → workflow: closing the matter ticks "File Completed" and marks the
//    card done; Not proceeding ticks "Not Proceeding". Reopening unticks them.
// Writes go straight to the database (not through the task/matter save), so
// the two never set each other off in a loop.

const db = () => createAdminClient();
const isFileCompleted = (t: string) => /file (is )?complete|matter (is )?complete|file closed/i.test(t);
const isNotProceeding = (t: string) => /not proceeding/i.test(t);
const doneMap = (c: TaskChecklist | null) => {
  const m = new Map<string, boolean>();
  for (const s of c?.sections ?? []) for (const i of s.items) m.set(i.id, !!i.done);
  return m;
};

// After a workflow card's steps changed: the matter's new status, or null.
export async function statusFromSteps(orgId: string, task: { matterId?: string | null; checklist?: TaskChecklist | null }, beforeChecklist: unknown): Promise<string | null> {
  if (!task.matterId || !task.checklist) return null;
  const before = doneMap(cleanChecklist(beforeChecklist));
  const items = task.checklist.sections.flatMap((s) => s.items);
  const turnedOn = (pred: (t: string) => boolean) => items.some((i) => pred(i.text) && i.done && !before.get(i.id));
  const turnedOff = (pred: (t: string) => boolean) => items.some((i) => pred(i.text) && !i.done && before.get(i.id));
  const allDone = items.filter((i) => !isNotProceeding(i.text)).every((i) => i.done || i.na) && items.some((i) => !before.get(i.id) && i.done);
  const { data: m } = await db().from("matters").select("status").eq("id", task.matterId).eq("org_id", orgId).maybeSingle();
  const cur = (m as { status?: string } | null)?.status;
  if (!cur) return null;
  let next: string | null = null;
  if (turnedOn(isNotProceeding)) next = "Not proceeding";
  else if (turnedOn(isFileCompleted) || allDone) next = "Closed";
  else if ((turnedOff(isFileCompleted) && cur === "Closed") || (turnedOff(isNotProceeding) && cur === "Not proceeding")) next = "Active";
  if (!next || next === cur) return null;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: next, updated_at: now };
  const extra: Record<string, unknown> = { status_changed_at: now, ...(next === "Closed" ? { closed_at: now } : {}) };
  let r = await db().from("matters").update({ ...patch, ...extra }).eq("id", task.matterId).eq("org_id", orgId);
  if (r.error) r = await db().from("matters").update(patch).eq("id", task.matterId).eq("org_id", orgId); // before migration 0072
  return r.error ? null : next;
}

// After the matter's status changed: update its workflow cards. Returns whether any changed.
export async function stepsFromStatus(orgId: string, matterId: string, before: string | undefined, after: string): Promise<boolean> {
  if (before === after) return false;
  const { data } = await db().from("tasks").select("id, status, checklist").eq("org_id", orgId).eq("matter_id", matterId);
  const now = new Date().toISOString();
  let changed = false;
  for (const t of (data ?? []) as { id: string; status: string; checklist: unknown }[]) {
    const c = cleanChecklist(t.checklist);
    if (!c || !c.sections.length) continue;
    const set = (pred: (x: string) => boolean, done: boolean) =>
      c.sections.map((s) => ({ ...s, items: s.items.map((i) => (pred(i.text) && !!i.done !== done ? { ...i, done, doneAt: done ? now : null } : i)) }));
    let sections = c.sections;
    let status = t.status;
    if (after === "Closed") {
      sections = set(isFileCompleted, true);
      status = "done";
    } else if (after === "Not proceeding") {
      sections = set(isNotProceeding, true);
      status = "done";
    } else {
      if (before === "Closed") sections = set(isFileCompleted, false);
      if (before === "Not proceeding") sections = set(isNotProceeding, false);
      if (t.status === "done") status = "inprogress";
    }
    const next = { ...c, sections };
    if (JSON.stringify(next) === JSON.stringify(c) && status === t.status) continue;
    await db().from("tasks").update({ checklist: next, status, updated_at: now }).eq("id", t.id).eq("org_id", orgId);
    changed = true;
  }
  return changed;
}
