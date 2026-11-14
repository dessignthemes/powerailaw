import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { canSeeTask } from "@/lib/data/tasks";
import { cleanChecklist, dueDateOf } from "@/lib/checklist";
import { KEY_DATE_FIELDS, isYmd } from "@/lib/matters/keyDates";

// Everything with a date, for the calendars: one matter's (its Calendar tab)
// or the whole firm's (the Firm calendar widget, for everyone in the firm):
//  • key dates (contract signed, attorney review, deposits, inspection, closing…)
//  • workflow steps that aren't done yet, with their due dates
//  • tasks due (private tasks only for the people they belong to)

const db = () => createAdminClient();

export type Deadline = {
  id: string;
  date: string; // YYYY-MM-DD
  kind: "key" | "step" | "task";
  title: string;
  done: boolean;
  matterId: string | null;
  matterNumber: string | null;
  matterTitle: string | null;
  taskId: string | null;
};

async function all<T>(build: (a: number, b: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export async function deadlines(orgId: string, me: { id: string; email: string | null }, range: { from: string; to: string }, matterId?: string | null): Promise<Deadline[]> {
  type M = { id: string; title: string; matter_number?: string | null; status: string; key_dates?: { dates?: Record<string, { date?: string | null; na?: boolean } | undefined> } | null };
  const matters = await all<M>((a, b) => {
    let q = db().from("matters").select("*").eq("org_id", orgId);
    if (matterId) q = q.eq("id", matterId);
    return q.order("id").range(a, b);
  });
  const byId = new Map(matters.map((m) => [m.id, m]));
  const inRange = (d: string | null | undefined): d is string => isYmd(d) && d >= range.from && d <= range.to;
  const label = (k: string) => KEY_DATE_FIELDS.find((f) => f.key === k)?.label ?? "Key date";
  const out: Deadline[] = [];

  for (const m of matters) {
    if (m.status === "Not proceeding") continue;
    for (const [k, v] of Object.entries(m.key_dates?.dates ?? {})) {
      if (!v || v.na || !inRange(v.date)) continue;
      out.push({ id: `key:${m.id}:${k}`, date: v.date!, kind: "key", title: label(k), done: false, matterId: m.id, matterNumber: m.matter_number ?? null, matterTitle: m.title, taskId: null });
    }
  }

  type T = { id: string; title: string; status: string; due_date: string | null; matter_id: string | null; checklist: unknown; is_private?: boolean | null; created_by?: string | null; assignee?: string | null; assigned_by?: string | null; offered_to?: string[] | null };
  const tasks = await all<T>((a, b) => {
    let q = db().from("tasks").select("*").eq("org_id", orgId);
    if (matterId) q = q.eq("matter_id", matterId);
    return q.order("id").range(a, b);
  });
  for (const t of tasks) {
    if (!canSeeTask(t, me)) continue;
    const m = t.matter_id ? byId.get(t.matter_id) : undefined;
    if (m?.status === "Not proceeding") continue;
    const base = { matterId: t.matter_id, matterNumber: m?.matter_number ?? null, matterTitle: m?.title ?? null, taskId: t.id };
    const c = cleanChecklist(t.checklist);
    if (c?.sections.length) {
      // A workflow: each step not done yet with its own due date.
      for (const s of c.sections)
        for (const i of s.items) {
          if (i.done || i.na) continue;
          const due = dueDateOf(i, c.dates);
          if (inRange(due)) out.push({ id: `step:${t.id}:${i.id}`, date: due!, kind: "step", title: i.text, done: false, ...base });
        }
    } else if (inRange(t.due_date)) {
      out.push({ id: `task:${t.id}`, date: t.due_date!, kind: "task", title: t.title, done: t.status === "done", ...base });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}
