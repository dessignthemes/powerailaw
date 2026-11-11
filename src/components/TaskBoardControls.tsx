"use client";

import { popFrame, popTitle, popInner, popHeading } from "@/lib/ui";
import { descriptionText } from "@/components/RichTextEditor";
import ClickAway from "@/components/ClickAway";
import { Check, Filter, SlidersHorizontal } from "lucide-react";
import type { BoardTask, TaskPriority as Priority } from "@/components/NewTaskModal";
import { displayName } from "@/lib/initials";
import { isDueIn, isOverdue } from "@/lib/taskDates";

export type DueFilter = "overdue" | "today" | "week" | "none";
export type AdvancedFilters = { priorities: Priority[]; assignees: string[]; creators: string[]; due: DueFilter[] };
export const NO_FILTERS: AdvancedFilters = { priorities: [], assignees: [], creators: [], due: [] };
export const UNASSIGNED = "__unassigned";

export type SortKey = "manual" | "due" | "priority" | "newest" | "title";
export type DisplayOptions = { sort: SortKey; hideDone: boolean };
export const DEFAULT_DISPLAY: DisplayOptions = { sort: "manual", hideDone: false };

export function countFilters(f: AdvancedFilters) {
  return f.priorities.length + f.assignees.length + f.creators.length + f.due.length;
}

// Within a group any choice matches (OR); across groups all must match (AND).
export function matchesFilters(t: BoardTask, f: AdvancedFilters) {
  if (f.priorities.length && !f.priorities.includes(t.priority)) return false;
  if (f.assignees.length) {
    const who = t.assignee ? t.assignee.toLowerCase() : UNASSIGNED;
    if (!f.assignees.some((a) => a.toLowerCase() === who)) return false;
  }
  if (f.creators.length && !(t.createdBy && f.creators.includes(t.createdBy))) return false;
  if (f.due.length) {
    const ok = f.due.some((d) =>
      d === "overdue" ? isOverdue(t) : d === "today" ? isDueIn(t, "today") : d === "week" ? isDueIn(t, "week") : !t.dueDate
    );
    if (!ok) return false;
  }
  return true;
}

export function matchesSearch(t: BoardTask, q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return t.title.toLowerCase().includes(s) || descriptionText(t.description ?? "").toLowerCase().includes(s) || (t.assignee ?? "").toLowerCase().includes(s);
}

const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

// Manual order: a dragged card's saved position, otherwise when it was added.
export function manualKey(t: BoardTask) {
  if (typeof t.position === "number") return t.position;
  const added = Date.parse(t.createdAt ?? "");
  return Number.isNaN(added) ? Number.MAX_SAFE_INTEGER : added;
}

export function sortTasks(list: BoardTask[], sort: SortKey) {
  if (sort === "manual") return [...list].sort((a, b) => manualKey(a) - manualKey(b));
  const out = [...list];
  if (sort === "due") out.sort((a, b) => (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99"));
  if (sort === "priority") out.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  if (sort === "newest") out.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  if (sort === "title") out.sort((a, b) => a.title.localeCompare(b.title));
  return out;
}

function toggle<T>(list: T[], v: T) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function Option({ on, label, onClick }: { on: boolean; label: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13.5px] text-left transition-colors ${on ? "bg-[#F3F1EC]" : "hover:bg-[#F3F2F0]"}`}>
      <span className={`w-4 h-4 rounded-[5px] border flex items-center justify-center flex-shrink-0 ${on ? "bg-dark border-dark text-white" : "bg-white border-[#DBD5C7]"}`}>
        {on && <Check size={11} strokeWidth={3} />}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

const Heading = ({ children }: { children: React.ReactNode }) => (
  <div className={popHeading}>{children}</div>
);

export function FilterMenu({
  value,
  onChange,
  members,
  onClose,
}: {
  value: AdvancedFilters;
  onChange: (f: AdvancedFilters) => void;
  members: { id: string; email: string; fullName?: string | null }[];
  onClose: () => void;
}) {
  return (
    <>
      <ClickAway onClose={onClose} />
      <div className={`absolute right-0 top-[calc(100%+10px)] z-50 w-[290px] ${popFrame}`}>
        <div className={popTitle}>
          <span className="flex items-center gap-2"><Filter size={14} strokeWidth={1.75} /> Filter tasks</span>
          {countFilters(value) > 0 && (
            <button onClick={() => onChange(NO_FILTERS)} className="font-sans normal-case tracking-normal text-[12px] font-medium text-ink bg-white border border-[#EBE8DF] hover:bg-[#F3F2F0] rounded-full px-2.5 py-0.5">
              Clear
            </button>
          )}
        </div>
        <div className={`${popInner} p-1.5 max-h-[64vh] overflow-y-auto`}>
        <Heading>Priority</Heading>
        {(["High", "Medium", "Low"] as Priority[]).map((p) => (
          <Option key={p} on={value.priorities.includes(p)} label={p} onClick={() => onChange({ ...value, priorities: toggle(value.priorities, p) })} />
        ))}
        <Heading>Due</Heading>
        {(
          [
            ["overdue", "Overdue"],
            ["today", "Due today"],
            ["week", "Due this week"],
            ["none", "No due date"],
          ] as [DueFilter, string][]
        ).map(([k, l]) => (
          <Option key={k} on={value.due.includes(k)} label={l} onClick={() => onChange({ ...value, due: toggle(value.due, k) })} />
        ))}
        <Heading>Assigned to</Heading>
        <Option on={value.assignees.includes(UNASSIGNED)} label="Unassigned" onClick={() => onChange({ ...value, assignees: toggle(value.assignees, UNASSIGNED) })} />
        {members.map((m) => (
          <Option key={m.id} on={value.assignees.includes(m.email)} label={displayName(m.fullName, m.email)} onClick={() => onChange({ ...value, assignees: toggle(value.assignees, m.email) })} />
        ))}
        <Heading>Created by</Heading>
        {members.map((m) => (
          <Option key={m.id} on={value.creators.includes(m.id)} label={displayName(m.fullName, m.email)} onClick={() => onChange({ ...value, creators: toggle(value.creators, m.id) })} />
        ))}
        </div>
      </div>
    </>
  );
}

export function DisplayMenu({ value, onChange, onClose }: { value: DisplayOptions; onChange: (d: DisplayOptions) => void; onClose: () => void }) {
  const sorts: [SortKey, string][] = [
    ["manual", "My order (drag to arrange)"],
    ["due", "Due date (soonest first)"],
    ["priority", "Priority (high first)"],
    ["newest", "Newest first"],
    ["title", "Title (A–Z)"],
  ];
  return (
    <>
      <ClickAway onClose={onClose} />
      <div className={`absolute right-0 top-[calc(100%+10px)] z-50 w-[270px] ${popFrame}`}>
        <div className={popTitle}>
          <span className="flex items-center gap-2"><SlidersHorizontal size={14} strokeWidth={1.75} /> Display</span>
        </div>
        <div className={`${popInner} p-1.5`}>
        <Heading>Sort cards by</Heading>
        {sorts.map(([k, l]) => (
          <button
            key={k}
            onClick={() => onChange({ ...value, sort: k })}
            className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13.5px] text-left transition-colors ${value.sort === k ? "bg-[#F3F1EC]" : "hover:bg-[#F3F2F0]"}`}
          >
            <span className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 bg-white ${value.sort === k ? "border-dark" : "border-[#DBD5C7]"}`}>
              {value.sort === k && <span className="w-2 h-2 rounded-full bg-dark" />}
            </span>
            {l}
          </button>
        ))}
        <Heading>Columns</Heading>
        <Option on={value.hideDone} label="Hide the Done column" onClick={() => onChange({ ...value, hideDone: !value.hideDone })} />
        </div>
        <div className="px-3 pt-2 pb-1 text-[11.5px] text-muted">Saved in this browser.</div>
      </div>
    </>
  );
}
