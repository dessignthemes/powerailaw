// A board's own quick filters ("+ Add more"), saved per board for the whole firm.
import { WAITING_LABEL } from "@/lib/tasks/waitingOn";

export type FilterKind = "waiting" | "priority" | "assignee" | "unassigned" | "nodue";
export type CustomFilter = { id: string; kind: FilterKind; value?: string };

type TaskLike = { waitingOn?: string | null; status: string; priority: string; assignee?: string | null; dueDate?: string | null };

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

// "title" → "Title company"; a firm's own party is shown as typed.
export const waitingLabel = (v: string) => (WAITING_LABEL as Record<string, string>)[v] ?? v;
const sameParty = (a: string | null | undefined, b: string) => !!a && (norm(a) === norm(b) || norm(waitingLabel(a)) === norm(b) || norm(a) === norm(waitingLabel(b)));

export function filterLabel(f: CustomFilter, nameOf: (email: string) => string = (e) => e): string {
  switch (f.kind) {
    case "waiting":
      return `Waiting on ${waitingLabel(f.value ?? "").toLowerCase()}`;
    case "priority":
      return `${f.value} priority`;
    case "assignee":
      return `Assigned to ${nameOf(f.value ?? "")}`;
    case "unassigned":
      return "Unassigned";
    case "nodue":
      return "No due date";
  }
}

export function filterTest(f: CustomFilter): (t: TaskLike) => boolean {
  switch (f.kind) {
    case "waiting":
      // Older tasks in the Waiting column count as waiting on the client.
      return (t) => sameParty(t.waitingOn, f.value ?? "") || (norm(f.value) === "client" && !t.waitingOn && t.status === "waiting");
    case "priority":
      return (t) => t.priority === f.value;
    case "assignee":
      return (t) => norm(t.assignee) === norm(f.value);
    case "unassigned":
      return (t) => !t.assignee;
    case "nodue":
      return (t) => !t.dueDate;
  }
}

const KINDS: FilterKind[] = ["waiting", "priority", "assignee", "unassigned", "nodue"];

export function cleanFilters(input: unknown): CustomFilter[] {
  if (!Array.isArray(input)) return [];
  const out: CustomFilter[] = [];
  for (const x of input.slice(0, 20)) {
    const f = (x ?? {}) as { id?: unknown; kind?: unknown; value?: unknown };
    if (!KINDS.includes(f.kind as FilterKind)) continue;
    const kind = f.kind as FilterKind;
    const value = typeof f.value === "string" ? f.value.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    if ((kind === "waiting" || kind === "assignee") && !value) continue;
    if (kind === "priority" && !["High", "Medium", "Low"].includes(value)) continue;
    const id = typeof f.id === "string" && /^[a-z0-9]{4,20}$/.test(f.id) ? f.id : Math.random().toString(36).slice(2, 10);
    const key = `${kind}:${norm(value)}`;
    if (out.some((o) => `${o.kind}:${norm(o.value)}` === key)) continue;
    out.push({ id, kind, ...(value ? { value } : {}) });
  }
  return out;
}
