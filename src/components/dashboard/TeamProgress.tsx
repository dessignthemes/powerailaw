"use client";

import { useMemo, useState } from "react";
import { Trophy, Users } from "lucide-react";
import type { BoardTask } from "@/components/NewTaskModal";

type Member = { id: string; email: string; fullName?: string | null };
type Period = "week" | "month" | "year";

const PERIODS: { key: Period; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
];

function periodStart(p: Period) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (p === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  if (p === "month") d.setDate(1);
  if (p === "year") d.setMonth(0, 1);
  return d;
}

// The four parts of each person's bar, in order.
const SEGMENTS = [
  { key: "onTime", label: "Completed on time", color: "#00C271", hint: "Finished on or before the due date" },
  { key: "late", label: "Completed", color: "#5B8DEF", hint: "Finished after the due date, or it had no due date" },
  { key: "open", label: "Still open", color: "#FFB341", hint: "Not finished, not past due" },
  { key: "overdue", label: "Overdue", color: "#FB5D67", hint: "Not finished and past its due date" },
] as const;

const initials = (name: string) =>
  name
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

// Team progress: for each person, tasks completed in the period (green on time,
// blue late or undated) next to what's still on their plate (yellow open, red
// overdue). Assigned = completed + still open + overdue.
// onPick: clicking a person shows their tasks on the Dashboard.
export default function TeamProgress({ tasks, members, onPick, className = "bg-card-alt rounded-3xl p-6 mt-5" }: { tasks: BoardTask[]; members: Member[]; onPick?: (email: string) => void; className?: string }) {
  const [period, setPeriod] = useState<Period>("week");

  const rows = useMemo(() => {
    const start = periodStart(period).getTime();
    const today = new Date().toLocaleDateString("en-CA");
    const byEmail = new Map(members.map((m) => [m.email.toLowerCase(), { member: m, onTime: 0, late: 0, open: 0, overdue: 0 }]));
    for (const t of tasks) {
      const row = t.assignee ? byEmail.get(t.assignee.toLowerCase()) : undefined;
      if (!row) continue;
      if (t.status === "done") {
        // Completed in the period: on time when finished on or before its due date.
        const at = Date.parse(t.updatedAt ?? t.createdAt ?? "");
        if (Number.isNaN(at) || at < start) continue;
        const doneDay = new Date(at).toLocaleDateString("en-CA");
        if (t.dueDate && doneDay <= t.dueDate) row.onTime++;
        else row.late++;
      } else if (t.dueDate && t.dueDate < today) row.overdue++;
      else row.open++;
    }
    return [...byEmail.values()]
      .map((r) => {
        const done = r.onTime + r.late;
        const assigned = done + r.open + r.overdue;
        return { ...r, done, assigned, pct: assigned ? Math.round((done / assigned) * 100) : 0 };
      })
      .sort((a, b) => b.done - a.done || b.onTime - a.onTime || b.pct - a.pct || a.overdue - b.overdue);
  }, [tasks, members, period]);

  const max = Math.max(1, ...rows.map((r) => r.assigned));
  const totalDone = rows.reduce((n, r) => n + r.done, 0);
  const totalAssigned = rows.reduce((n, r) => n + r.assigned, 0);
  const leader = rows[0]?.done ? rows[0] : null;

  return (
    <section className={className}>
      <div className="flex flex-wrap items-start gap-3 mb-5">
        <div className="flex-1 min-w-[160px]">
          <div className="flex items-center gap-2 text-[13.5px] text-muted">
            <Users size={15} strokeWidth={1.75} /> Team progress
          </div>
          <div className="text-[22px] font-semibold mt-1 leading-tight">
            {totalDone} of {totalAssigned} tasks done
          </div>
          <div className="text-[13px] text-muted mt-0.5">
            {leader ? (
              <span className="inline-flex items-center gap-1">
                <Trophy size={13} className="text-[#E0A100]" /> {leader.member.fullName || leader.member.email} leads with {leader.done} done
              </span>
            ) : (
              "Completed tasks show up here as the team finishes them."
            )}
          </div>
        </div>
        <div className="flex gap-1 bg-white rounded-full p-1">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)} className={`px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors ${period === p.key ? "bg-btn-hover" : "hover:bg-chip text-muted"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((r) => {
          const name = r.member.fullName || r.member.email;
          return (
            <div key={r.member.id} className="grid grid-cols-[minmax(90px,150px)_minmax(0,1fr)] items-center gap-3">
              {onPick ? (
                <button
                  onClick={() => onPick(r.member.email)}
                  title={`Show ${name}'s tasks`}
                  className="group flex items-center gap-2 min-w-0 text-left rounded-full -ml-1 pl-1 pr-2 py-0.5 hover:bg-white transition-colors"
                >
                  <span className="w-7 h-7 rounded-full bg-white border border-line text-[11px] font-semibold text-muted flex items-center justify-center flex-shrink-0 group-hover:border-ink group-hover:text-ink">{initials(name)}</span>
                  <span className="text-[13.5px] font-medium truncate group-hover:underline underline-offset-2">{name}</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-full bg-white border border-line text-[11px] font-semibold text-muted flex items-center justify-center flex-shrink-0">{initials(name)}</span>
                  <span className="text-[13.5px] font-medium truncate" title={name}>
                    {name}
                  </span>
                </div>
              )}
              <div
                className="h-6 bg-white rounded-full overflow-hidden flex"
                role="img"
                aria-label={`${name}: ${r.onTime} completed on time, ${r.late} completed, ${r.open} still open, ${r.overdue} overdue`}
                title={`${r.onTime} completed on time · ${r.late} completed · ${r.open} still open · ${r.overdue} overdue`}
              >
                {SEGMENTS.map((seg) =>
                  r[seg.key] > 0 ? (
                    <div key={seg.key} className="h-full transition-[width] duration-500 flex items-center justify-center text-[11px] font-semibold text-[#1B191A]" style={{ width: `${(r[seg.key] / max) * 100}%`, backgroundColor: seg.color }}>
                      {(r[seg.key] / max) * 100 >= 6 ? r[seg.key] : ""}
                    </div>
                  ) : null
                )}
              </div>
            </div>
          );
        })}
        {!rows.length && <div className="text-[13.5px] text-muted">No team members yet.</div>}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-5 text-[12px] text-muted">
        {SEGMENTS.map((seg) => (
          <span key={seg.key} className="flex items-center gap-1.5" title={seg.hint}>
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: seg.color }} /> {seg.label}
          </span>
        ))}
        <span className="text-muted-light">Completed counts tasks finished {PERIODS.find((p) => p.key === period)?.label.toLowerCase()}.</span>
      </div>
    </section>
  );
}
