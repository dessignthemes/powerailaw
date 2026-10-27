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

const initials = (name: string) =>
  name
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

// Team progress: for each person, tasks completed in the period (green) next to
// what's still open on their plate (grey). Assigned = completed + still open.
// onPick: clicking a person shows their tasks on the Dashboard.
export default function TeamProgress({ tasks, members, onPick, className = "bg-card-alt rounded-3xl p-6 mt-5" }: { tasks: BoardTask[]; members: Member[]; onPick?: (email: string) => void; className?: string }) {
  const [period, setPeriod] = useState<Period>("week");

  const rows = useMemo(() => {
    const start = periodStart(period).getTime();
    const today = new Date().toLocaleDateString("en-CA");
    const byEmail = new Map(members.map((m) => [m.email.toLowerCase(), { member: m, done: 0, open: 0, overdue: 0 }]));
    for (const t of tasks) {
      const row = t.assignee ? byEmail.get(t.assignee.toLowerCase()) : undefined;
      if (!row) continue;
      if (t.status === "done") {
        const at = Date.parse(t.updatedAt ?? t.createdAt ?? "");
        if (!Number.isNaN(at) && at >= start) row.done++;
      } else {
        row.open++;
        if (t.dueDate && t.dueDate < today) row.overdue++;
      }
    }
    return [...byEmail.values()]
      .map((r) => ({ ...r, assigned: r.done + r.open, pct: r.done + r.open ? Math.round((r.done / (r.done + r.open)) * 100) : 0 }))
      .sort((a, b) => b.done - a.done || b.pct - a.pct || a.open - b.open);
  }, [tasks, members, period]);

  const max = Math.max(1, ...rows.map((r) => r.assigned));
  const totalDone = rows.reduce((n, r) => n + r.done, 0);
  const totalAssigned = rows.reduce((n, r) => n + r.assigned, 0);
  const leader = rows[0]?.done ? rows[0] : null;

  return (
    <section className={className}>
      <div className="flex flex-wrap items-start gap-3 mb-5">
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2 text-[13.5px] text-muted">
            <Users size={15} strokeWidth={1.75} /> Team progress
          </div>
          <div className="text-[26px] font-semibold mt-1">
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
            <button key={p.key} onClick={() => setPeriod(p.key)} className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${period === p.key ? "bg-btn-hover" : "hover:bg-chip text-muted"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((r) => {
          const name = r.member.fullName || r.member.email;
          return (
            <div key={r.member.id} className="grid grid-cols-[minmax(120px,200px)_minmax(0,1fr)_215px] items-center gap-3">
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
              <div className="h-6 bg-white rounded-full overflow-hidden flex" role="img" aria-label={`${name}: ${r.done} done, ${r.open} open`} title={`${r.done} done · ${r.open} open`}>
                <div className="h-full bg-[#00C271] transition-[width] duration-500" style={{ width: `${(r.done / max) * 100}%` }} />
                <div className="h-full bg-[#D1D7E0] transition-[width] duration-500" style={{ width: `${(r.open / max) * 100}%` }} />
              </div>
              <div className="text-[13px] whitespace-nowrap text-right">
                <b>{r.done}</b> of {r.assigned} done
                <span className="text-muted"> · {r.pct}%</span>
                {r.overdue > 0 && <span className="text-[#B42318]"> · {r.overdue} overdue</span>}
              </div>
            </div>
          );
        })}
        {!rows.length && <div className="text-[13.5px] text-muted">No team members yet.</div>}
      </div>

      <div className="flex items-center gap-4 mt-5 text-[12px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#00C271]" /> Completed {PERIODS.find((p) => p.key === period)?.label.toLowerCase()}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#D1D7E0]" /> Still open
        </span>
      </div>
    </section>
  );
}
