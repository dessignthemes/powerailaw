"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ListChecks, Flag, ChevronRight, Calendar, Activity, BarChart3, ArrowUpRight, Lock, AlarmClock, CheckCircle2, Circle, UserX, Users, Folder, Layers, PieChart,
  History, UserRound, Hourglass, CalendarClock, Timer, UserPlus, Phone, Receipt, Sparkles, Clock3, StickyNote, Zap, Search, ArrowUp, Inbox, Funnel,
} from "lucide-react";
import TeamProgress from "@/components/dashboard/TeamProgress";
import ScrollHint from "@/components/ScrollHint";
import MemberAvatar from "@/components/MemberAvatar";
import { priorityMeta } from "@/components/NewTaskModal";
import { isDueIn, isOverdue, ymd } from "@/lib/taskDates";
import type { DashData, WidgetDef, WidgetSize } from "./types";

// ── small shared pieces ──────────────────────────────────────────────────────
// The size the widget is drawn at, so text can shrink in Small boxes.
export const WidgetSizeContext = createContext<WidgetSize>("m");
const useSmall = () => useContext(WidgetSizeContext) === "s";
const nowMs = () => Date.now(); // read at render time on purpose (widgets refresh with the page)
const ROW = "flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-[14.5px] font-medium bg-[#F3F2F0] border border-[#EBEAE7] hover:bg-[#EFEEEB] transition-colors";
const ROW_S = "flex-shrink-0 flex items-center gap-2 px-2.5 py-1 rounded-lg text-[13px] font-medium bg-[#F3F2F0] border border-[#EBEAE7] hover:bg-[#EFEEEB] transition-colors";
const PILL = "flex items-center gap-1.5 px-3 py-1 rounded-full text-[12.5px] font-medium text-ink bg-white border border-[#E5E3DF] hover:bg-[#F3F2F0] transition-colors";
const fmtDay = (ymdStr: string) => {
  const [y, m, d] = ymdStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const daysUntil = (ymdStr: string) => {
  const [y, m, d] = ymdStr.split("-").map(Number);
  const t = new Date();
  return Math.round((new Date(y, m - 1, d).getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / 86400000);
};
const timeAgo = (iso: string) => {
  const mins = Math.floor(Math.max(0, Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};
const firstName = (d: DashData, email?: string | null) => {
  const m = d.teamMembers.find((x) => x.email.toLowerCase() === (email ?? "").toLowerCase());
  return (m?.fullName || email || "Unassigned").split(/[\s@]/)[0];
};

function Big({ n, label, sub }: { n: React.ReactNode; label?: string; sub?: React.ReactNode }) {
  const small = useSmall();
  return (
    <div className="mt-auto">
      <div className={`${small ? "text-[32px]" : "text-[40px]"} leading-none font-display font-semibold tabular-nums`}>{n}</div>
      {label && <div className={`${small ? "text-[12px]" : "text-[13px]"} text-muted mt-1.5`}>{label}</div>}
      {sub && <div className={`${small ? "text-[11.5px]" : "text-[12.5px]"} text-muted mt-0.5`}>{sub}</div>}
    </div>
  );
}
function Empty({ icon: Icon, title, sub }: { icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; title: string; sub?: string }) {
  const small = useSmall();
  if (small)
    return (
      <div className="mt-auto">
        <div className="text-[13px] font-semibold">{title}</div>
        {sub && <div className="text-[11.5px] text-muted mt-0.5">{sub}</div>}
      </div>
    );
  return (
    <div className="mt-auto">
      <div className="w-9 h-9 rounded-xl bg-[#F1F0EE] flex items-center justify-center text-muted mb-2">
        <Icon size={16} strokeWidth={1.75} />
      </div>
      <div className="text-[14px] font-semibold">{title}</div>
      {sub && <div className="text-[12.5px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}
function Bars({ rows, total }: { rows: { label: string; n: number; href?: string }[]; total: number }) {
  return (
    <div className="flex flex-col gap-2.5 mt-auto">
      {rows.map((r) => {
        const inner = (
          <>
            <div className="flex items-center justify-between text-[13px] mb-1">
              <span className="font-medium truncate">{r.label}</span>
              <span className="tabular-nums text-muted">{r.n}</span>
            </div>
            <div className="h-2 rounded-full bg-[#F1F0EE] overflow-hidden">
              <div className="h-full rounded-full bg-[#5E7BA6]" style={{ width: `${total ? Math.max(4, (r.n / total) * 100) : 0}%` }} />
            </div>
          </>
        );
        return r.href ? (
          <Link key={r.label} href={r.href} className="block hover:opacity-80">
            {inner}
          </Link>
        ) : (
          <div key={r.label}>{inner}</div>
        );
      })}
    </div>
  );
}

// Data from the server, fetched once per page for the widgets that need it.
const cache = new Map<string, Promise<unknown>>();
function useJson<T>(url: string): T | null {
  const [v, setV] = useState<T | null>(null);
  useEffect(() => {
    let live = true;
    if (!cache.has(url)) cache.set(url, fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    cache.get(url)!.then((x) => live && setV(x as T));
    return () => {
      live = false;
    };
  }, [url]);
  return v;
}

// ── the original Dashboard cards ─────────────────────────────────────────────
function DueCard({ d, small }: { d: DashData; small?: boolean }) {
  const list = useRef<HTMLDivElement>(null);
  const counts = new Map<string, number>();
  for (const t of d.dueTasks) counts.set(t.boardId ?? "general", (counts.get(t.boardId ?? "general") ?? 0) + 1);
  const rows = [...counts.entries()].sort((x, y) => y[1] - x[1]);
  return (
    <>
      <div className={`${small ? "text-[16px]" : "text-[22px]"} leading-tight font-display font-semibold mb-1`}>
        {d.tasksLoaded ? d.dueTasks.length : "–"} {d.dueTasks.length === 1 ? "task" : "tasks"} {d.dueLabel.toLowerCase()}
      </div>
      {!small && (
        <div className="text-[13px] text-muted">
          {d.openCount} open in total · {d.undatedTasks.length} with no due date
        </div>
      )}
      {rows.length > 0 && (
        <>
          <div ref={list} className={`${small ? "mt-2" : "mt-4"} flex flex-col gap-1.5 min-h-0 scroll-on-hover pr-1`}>
            {rows.map(([key, n]) => (
              <Link key={key} href={`/dashboard/task-board?board=${key}&due=${d.range}`} className={`group/row ${small ? ROW_S : ROW}`}>
                <span className="font-semibold tabular-nums w-5 text-right">{n}</span>
                <span className="truncate flex-1">{key === "general" ? d.generalName : d.boardName(key)}</span>
                <span className="text-muted group-hover/row:text-ink">→</span>
              </Link>
            ))}
          </div>
          <ScrollHint list={list} total={rows.length} />
        </>
      )}
    </>
  );
}

const OVERDUE_RED = "#D92D20";
function PriorityCard({ d, small }: { d: DashData; small?: boolean }) {
  const n = (p: string) => (p === "Overdue" ? d.dueTasks.filter(isOverdue).length : d.dueTasks.filter((t) => t.priority === p).length);
  return (
    <>
      <div className={`${small ? "text-[16px]" : "text-[22px]"} leading-tight font-display font-semibold mb-1`}>
        {d.tasksLoaded ? d.dueTasks.length : "–"} {d.dueTasks.length === 1 ? "task" : "tasks"} by priority
      </div>
      <div className={`${small ? "mt-2" : "mt-4"} flex flex-col gap-1.5`}>
        {(["High", "Medium", "Low", "Overdue"] as const).map((p) => {
          const count = n(p);
          const active = d.priorityFilter === p;
          return (
            <button
              key={p}
              onClick={() => d.setPriorityFilter(active ? null : p)}
              disabled={!count && !active}
              style={{ borderLeftColor: p === "Overdue" ? OVERDUE_RED : priorityMeta[p].bg }}
              title={count ? (p === "Overdue" ? "Show only overdue tasks in the Tasks widget" : `Show only ${p.toLowerCase()} priority in the Tasks widget`) : undefined}
              className={`group/row flex items-center gap-2 pl-2.5 pr-3 ${small ? "py-1 text-[13px] border-l-[6px]" : "py-2 text-[14.5px] border-l-[8px]"} rounded-xl font-medium text-ink bg-[#F3F2F0] hover:bg-[#EFEEEB] transition-colors disabled:opacity-45 ${active ? "ring-2 ring-offset-1 ring-[#1b191a]/40" : ""}`}
            >
              <span className="font-semibold tabular-nums w-5 text-right">{d.tasksLoaded ? count : "–"}</span>
              <span className="truncate flex-1 text-left">{p}</span>
              <span className="opacity-70 group-hover/row:opacity-100">→</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function CalendarCard({ d, small }: { d: DashData; small?: boolean }) {
  const list = useRef<HTMLDivElement>(null);
  const ev = d.cal.events;
  return (
    <>
      <div className={`${small ? "text-[16px]" : "text-[22px]"} leading-tight font-display font-semibold mb-1`}>
        {d.cal.loaded ? ev.length : "–"} {ev.length === 1 ? "event" : "events"}
      </div>
      <div className={`text-[13px] text-muted flex flex-wrap gap-x-1 ${small && d.cal.loaded && d.cal.connected ? "hidden" : ""}`}>
        {!d.cal.loaded ? (
          "Loading your calendar…"
        ) : !d.cal.connected ? (
          <Link href="/dashboard/calendar" className="underline underline-offset-2 hover:text-ink">
            Connect Outlook or Google Calendar
          </Link>
        ) : (
          (["today", "week", "month"] as const)
            .filter((k) => k !== d.range)
            .map((k) => (
              <span key={k} className="after:content-['·'] after:ml-1 last:after:content-none">
                <span className="text-ink font-medium">{d.eventsIn(k).length}</span> {k === "today" ? "today" : `this ${k}`}
              </span>
            ))
        )}
      </div>
      {d.cal.loaded && d.cal.connected && ev.length > 0 && (
        <>
          <div ref={list} className={`${small ? "mt-2" : "mt-4"} flex flex-col gap-1.5 min-h-0 scroll-on-hover pr-1`}>
            {ev.map((e) => (
              <button key={e.id} onClick={() => d.openEvent(e)} className={`w-full text-left ${small ? ROW_S : ROW} font-normal`}>
                <span className={`mono text-[12px] text-muted flex-shrink-0 ${small ? "w-[46px]" : "w-[54px]"}`}>{d.range === "today" ? d.fmtTime(e) : d.eventStart(e).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                <span className="font-medium truncate">{e.title}</span>
              </button>
            ))}
          </div>
          <ScrollHint list={list} total={ev.length} />
        </>
      )}
    </>
  );
}

function TasksList({ d }: { d: DashData }) {
  const due = !d.priorityFilter ? d.dueTasks : d.priorityFilter === "Overdue" ? d.dueTasks.filter(isOverdue) : d.dueTasks.filter((t) => t.priority === d.priorityFilter);
  if (!d.tasksLoaded) return <div className="text-[14px] text-muted m-auto">Loading tasks…</div>;
  if (!due.length && !d.undatedTasks.length)
    return <Empty icon={ListChecks} title={`Nothing due ${d.rangeWord}`} sub="New tasks show up here." />;
  return (
    <div className="-mx-4 -my-1 min-h-0 flex-1 scroll-on-hover">
      {due.length > 0 && (
        <>
          <div className="px-5 pt-3 pb-1 flex items-center justify-between">
            <span className="mono text-[11px] uppercase tracking-wider text-muted">{d.dueLabel}</span>
            {d.priorityFilter && (
              <button onClick={() => d.setPriorityFilter(null)} className="text-[12px] text-muted underline underline-offset-2 hover:text-ink">
                {d.priorityFilter} only · show all
              </button>
            )}
          </div>
          <div className="divide-y divide-[#F1F0ED]">{due.map(d.renderTaskRow)}</div>
        </>
      )}
      {!due.length && <div className="px-5 py-4 text-[14px] text-muted">Nothing due {d.rangeWord}.</div>}
      {d.undatedTasks.length > 0 && (
        <>
          <div className="px-5 pt-4 pb-1 mono text-[11px] uppercase tracking-wider text-muted">No due date</div>
          <div className="divide-y divide-[#F1F0ED]">{d.undatedTasks.map(d.renderTaskRow)}</div>
        </>
      )}
    </div>
  );
}

function Events({ d }: { d: DashData }) {
  if (!d.cal.loaded) return <div className="text-[14px] text-muted m-auto">Loading events…</div>;
  if (!d.cal.connected) return <Empty icon={Calendar} title="No calendar connected" sub="Connect Outlook or Google Calendar in Settings." />;
  if (!d.cal.events.length) return <Empty icon={Calendar} title={`Nothing scheduled ${d.rangeWord}`} />;
  const byDay = new Map<string, typeof d.cal.events>();
  for (const e of d.cal.events) byDay.set(d.eventStart(e).toDateString(), [...(byDay.get(d.eventStart(e).toDateString()) ?? []), e]);
  return (
    <div className="-mx-4 -my-1 min-h-0 flex-1 scroll-on-hover">
      {[...byDay.entries()].map(([day, list]) => (
        <div key={day}>
          <div className="px-5 pt-3 pb-1 mono text-[11px] uppercase tracking-wider text-muted">
            {new Date(day).toDateString() === new Date().toDateString() ? "Today" : new Date(day).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </div>
          <div className="divide-y divide-[#F1F0ED]">
            {list.map((e) => (
              <button key={e.id} onClick={() => d.openEvent(e)} className="w-full text-left flex items-center gap-4 px-5 py-2 hover:bg-chip/60 transition-colors">
                <span className="mono text-[12px] text-muted w-16 flex-shrink-0">{d.fmtTime(e)}</span>
                <span className="text-[13.5px] font-medium truncate flex-1">{e.title}</span>
                {e.location && <span className="text-[12.5px] text-muted truncate max-w-[200px] hidden sm:inline">{e.location}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentActivity({ d }: { d: DashData }) {
  if (!d.recent.length) return <Empty icon={Activity} title="No activity yet" />;
  return (
    <div className="-mx-4 -my-2 divide-y divide-[#F1F0ED] min-h-0 flex-1 scroll-on-hover">
      {d.recent.map((t) => {
        const created = !t.updatedAt || !t.createdAt || Math.abs(new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime()) < 2000;
        const verb = created ? "Created" : t.status === "done" ? "Completed" : "Updated";
        return (
          <div key={t.id} onClick={() => d.openTask(t)} className="flex items-center justify-between gap-3 px-4 py-2 cursor-pointer hover:bg-chip/40 transition-colors">
            <div className="text-[13.5px] truncate">
              <span className="text-muted">{verb} task</span>{" "}
              <span className="font-medium">
                {t.isPrivate && <Lock size={12} strokeWidth={2.25} className="inline -mt-0.5 mr-1 text-muted" aria-label="Private" />}
                {t.title}
              </span>
            </div>
            <span className="flex items-center gap-2 flex-shrink-0">
              <span className="mono text-[11.5px] text-muted">{timeAgo((t.updatedAt ?? t.createdAt)!)}</span>
              <MemberAvatar userId={created ? t.createdBy : t.updatedBy ?? t.createdBy} label={created ? "Created by" : `${verb} by`} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── new widgets ──────────────────────────────────────────────────────────────
function MyOpenTasks({ d }: { d: DashData }) {
  const mine = d.allTasks
    .filter((t) => t.status !== "done" && (t.assignee ?? "").toLowerCase() === (d.meEmail ?? "").toLowerCase())
    .sort((a, b) => (a.dueDate ?? "9999") .localeCompare(b.dueDate ?? "9999"));
  if (!mine.length) return <Empty icon={CheckCircle2} title="All clear" sub="No open tasks assigned to you." />;
  return (
    <div className="flex flex-col gap-1 min-h-0 flex-1 scroll-on-hover -mx-1">
      {mine.map((t) => (
        <div key={t.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[#F3F2F0] cursor-pointer" onClick={() => d.openTask(t)}>
          <button onClick={(e) => (e.stopPropagation(), d.toggleDone(t))} aria-label="Mark as done" className="text-muted hover:text-green-600 flex-shrink-0">
            <Circle size={16} strokeWidth={1.75} />
          </button>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-medium truncate">{t.title}</span>
            <span className={`block text-[11.5px] ${t.dueDate && t.dueDate < d.todayStr ? "text-red-600" : "text-muted"}`}>{t.dueDate ? `${t.dueDate < d.todayStr ? "Overdue · " : ""}${fmtDay(t.dueDate)}` : "No due date"} · {d.boardName(t.boardId)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// Two task lists that don't follow "View Team Tasks": one is always yours,
// the other always the whole team's. Both follow Today / Week / Month.
const PRI_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
function ScopedTasks({ d, team }: { d: DashData; team?: boolean }) {
  const small = useSmall();
  const me = (d.meEmail ?? "").toLowerCase();
  const pool = d.allTasks.filter(
    (t) =>
      t.status !== "done" &&
      (team || (t.assignee ?? "").toLowerCase() === me || (!t.assignee && (t.offeredTo ?? []).some((e) => e.toLowerCase() === me)))
  );
  const byPri = (a: (typeof pool)[number], b: (typeof pool)[number]) =>
    (PRI_RANK[a.priority] ?? 3) - (PRI_RANK[b.priority] ?? 3) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
  const late = pool.filter(isOverdue).sort(byPri);
  const due = pool.filter((t) => isDueIn(t, d.range) && !isOverdue(t)).sort(byPri);
  const undated = pool.filter((t) => !t.dueDate);
  if (!d.tasksLoaded) return <div className="text-[14px] text-muted m-auto">Loading tasks…</div>;
  const memberId = (email?: string | null) => d.teamMembers.find((m) => m.email.toLowerCase() === (email ?? "").toLowerCase())?.id ?? null;
  const row = (t: (typeof pool)[number]) => (
    <div key={t.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[#F3F2F0] cursor-pointer" onClick={() => d.openTask(t)}>
      <button onClick={(e) => (e.stopPropagation(), d.toggleDone(t))} aria-label="Mark as done" className="text-muted hover:text-green-600 flex-shrink-0">
        <Circle size={16} strokeWidth={1.75} />
      </button>
      <span className="min-w-0 flex-1">
        <span className={`block ${small ? "text-[13px]" : "text-[14px]"} font-medium truncate`}>{t.title}</span>
        <span className={`block text-[11.5px] truncate ${isOverdue(t) ? "text-[#B42318]" : "text-muted"}`}>
          {t.dueDate ? `${isOverdue(t) ? "Overdue · " : ""}${fmtDay(t.dueDate)}` : "No due date"} · {d.boardName(t.boardId)}
          {team && <span className="text-muted"> · {t.assignee ? firstName(d, t.assignee) : "Unassigned"}</span>}
        </span>
      </span>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: priorityMeta[t.priority]?.bg }} title={`${t.priority} priority`} />
      {team && <MemberAvatar userId={memberId(t.assignee)} label="Assigned to" />}
    </div>
  );
  const head = (label: string, n: number, red?: boolean) => (
    <div className={`px-2 pt-2 pb-1 mono text-[11px] uppercase tracking-wider ${red ? "text-[#B42318]" : "text-muted"}`}>
      {label} · {n}
    </div>
  );
  return (
    <>
      <div className={`${small ? "text-[16px]" : "text-[22px]"} leading-tight font-display font-semibold mb-1`}>
        {late.length + due.length} {late.length + due.length === 1 ? "task" : "tasks"} {d.dueLabel.toLowerCase()}
      </div>
      <div className={`${small ? "text-[12px]" : "text-[13px]"} mb-2`}>
        <span className={late.length ? "text-[#B42318] font-medium" : "text-muted"}>{late.length ? `${late.length} overdue` : "Nothing overdue"}</span>
        <span className="text-muted"> · {pool.length} open{team ? " across the team" : ""}</span>
      </div>
      {!late.length && !due.length && (team || !undated.length) ? (
        <Empty icon={CheckCircle2} title={`Nothing due ${d.rangeWord}`} sub={team ? "The whole team is on track." : "No open tasks for you."} />
      ) : (
        <div className="flex flex-col min-h-0 flex-1 scroll-on-hover -mx-1">
          {late.length > 0 && (
            <>
              {head("Overdue", late.length, true)}
              {late.map(row)}
            </>
          )}
          {due.length > 0 && (
            <>
              {head(d.dueLabel, due.length)}
              {due.map(row)}
            </>
          )}
          {!team && undated.length > 0 && (
            <>
              {head("No due date", undated.length)}
              {undated.map(row)}
            </>
          )}
        </div>
      )}
    </>
  );
}

function DoneThisWeek({ d }: { d: DashData }) {
  const days = [...Array(7)].map((_, i) => {
    const x = new Date();
    x.setDate(x.getDate() - (6 - i));
    return ymd(x);
  });
  const done = d.allTasks.filter((t) => t.status === "done" && t.updatedAt && days.includes(ymd(new Date(t.updatedAt))));
  const per = days.map((day) => done.filter((t) => ymd(new Date(t.updatedAt!)) === day).length);
  const max = Math.max(1, ...per);
  return (
    <div className="mt-auto flex items-end justify-between gap-3">
      <Big n={done.length} label={done.length ? "finished in 7 days" : "A fresh week"} />
      <div className="flex items-end gap-1 h-14">
        {per.map((n, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-2.5 rounded-sm bg-[#5E7BA6]" style={{ height: `${Math.max(3, (n / max) * 40)}px`, opacity: n ? 1 : 0.25 }} title={`${n} on ${fmtDay(days[i])}`} />
            <span className="text-[9.5px] text-muted">{"SMTWTFS"[new Date(`${days[i]}T12:00:00`).getDay()]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Workload({ d }: { d: DashData }) {
  const open = d.allTasks.filter((t) => t.status !== "done");
  const by = new Map<string, { n: number; late: number }>();
  for (const t of open) {
    const k = (t.assignee ?? "").toLowerCase();
    const v = by.get(k) ?? { n: 0, late: 0 };
    v.n++;
    if (isOverdue(t)) v.late++;
    by.set(k, v);
  }
  const rows = [...by.entries()].sort((a, b) => b[1].n - a[1].n);
  if (!rows.length) return <Empty icon={Users} title="No open tasks" />;
  const max = Math.max(...rows.map((r) => r[1].n));
  return (
    <div className="flex flex-col gap-2.5 min-h-0 flex-1 scroll-on-hover justify-end">
      {rows.map(([email, v]) => (
        <button key={email || "none"} onClick={() => email && d.setScope(email)} className="text-left hover:opacity-80" title={email ? "Show their tasks" : undefined}>
          <div className="flex items-center justify-between text-[13px] mb-1">
            <span className="font-medium truncate">{email ? firstName(d, email) : "Unassigned"}</span>
            <span className="tabular-nums text-muted">
              {v.n}
              {v.late > 0 && <span className="text-red-600"> · {v.late} late</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-[#F1F0EE] overflow-hidden flex">
            <div className="h-full bg-[#5E7BA6]" style={{ width: `${((v.n - v.late) / max) * 100}%` }} />
            <div className="h-full bg-[#FB5D67]" style={{ width: `${(v.late / max) * 100}%` }} />
          </div>
        </button>
      ))}
    </div>
  );
}

const OPEN = (s: string) => s !== "Closed";
function MattersByStatus({ d }: { d: DashData }) {
  const open = d.matters.filter((m) => OPEN(m.status));
  const order = ["Lead", "Consultation", "Engaged", "Active"];
  const rows = order.map((s) => ({ label: s, n: open.filter((m) => m.status === s).length, href: `/dashboard/matters?status=${s}` })).filter((r) => r.n);
  if (!rows.length) return <Empty icon={Layers} title="No open matters" />;
  return <Bars rows={rows} total={open.length} />;
}
function PracticeMix({ d }: { d: DashData }) {
  const open = d.matters.filter((m) => OPEN(m.status));
  const by = new Map<string, number>();
  for (const m of open) by.set(m.category || "No category", (by.get(m.category || "No category") ?? 0) + 1);
  const rows = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, n]) => ({ label, n }));
  if (!rows.length) return <Empty icon={PieChart} title="No open matters" />;
  return <Bars rows={rows} total={open.length} />;
}
function MatterRows({ d, list, right, empty, compact = false }: { d: DashData; list: typeof d.matters; right: (m: (typeof d.matters)[number]) => React.ReactNode; empty: React.ReactNode; compact?: boolean }) {
  if (!list.length) return <>{empty}</>;
  // Compact: one short line per matter (name, then number in grey), about half the height.
  if (compact)
    return (
      <div className="flex flex-col gap-1 min-h-0 flex-1 scroll-on-hover pr-1">
        {list.map((m) => (
          <Link
            key={m.id}
            href={`/dashboard/matters/${m.id}`}
            title={[m.title, m.matterNumber, m.status, m.category].filter(Boolean).join(" · ")}
            className="flex-shrink-0 flex items-center gap-2 px-3 py-[5px] rounded-lg text-[13px] bg-[#F3F2F0] border border-[#EBEAE7] hover:bg-[#EFEEEB] transition-colors"
          >
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{m.title}</span>
              {m.matterNumber && <span className="text-muted text-[11.5px]"> · {m.matterNumber}</span>}
            </span>
            <span className="text-[11.5px] text-muted flex-shrink-0">{right(m)}</span>
          </Link>
        ))}
      </div>
    );
  return (
    <div className="flex flex-col gap-1.5 min-h-0 flex-1 scroll-on-hover pr-1">
      {list.map((m) => (
        <Link key={m.id} href={`/dashboard/matters/${m.id}`} className={`${ROW} font-normal`}>
          <span className="min-w-0 flex-1">
            <span className="block font-medium truncate">{m.title}</span>
            <span className="block text-[11.5px] text-muted truncate">{[m.matterNumber, m.status, m.category].filter(Boolean).join(" · ")}</span>
          </span>
          <span className="text-[12px] text-muted flex-shrink-0">{right(m)}</span>
        </Link>
      ))}
    </div>
  );
}

// Upcoming dates: open tasks with a due date and matters with a due date, next 60 days.
function upcoming(d: DashData) {
  const until = new Date();
  until.setDate(until.getDate() + 60);
  const end = ymd(until);
  const items = [
    ...d.allTasks.filter((t) => t.status !== "done" && t.dueDate && t.dueDate >= d.todayStr && t.dueDate <= end).map((t) => ({ key: `t${t.id}`, date: t.dueDate!, title: t.title, sub: d.boardName(t.boardId), open: () => d.openTask(t), href: null as string | null })),
    ...d.matters.filter((m) => OPEN(m.status) && m.dueDate && m.dueDate >= d.todayStr && m.dueDate <= end).map((m) => ({ key: `m${m.id}`, date: m.dueDate!, title: m.title, sub: m.matterNumber ?? "Matter", open: null, href: `/dashboard/matters/${m.id}` })),
  ];
  return items.sort((a, b) => a.date.localeCompare(b.date));
}
function ImportantDates({ d }: { d: DashData }) {
  const items = upcoming(d);
  if (!items.length) return <Empty icon={CalendarClock} title="Clear for 60 days" sub="No deadlines in the next two months." />;
  return (
    <div className="flex flex-col gap-1.5 min-h-0 flex-1 scroll-on-hover pr-1">
      {items.map((x) => {
        const n = daysUntil(x.date);
        const inner = (
          <>
            <span className="w-11 flex-shrink-0 text-center">
              <span className="block text-[10.5px] uppercase text-muted">{new Date(`${x.date}T12:00:00`).toLocaleDateString("en-US", { month: "short" })}</span>
              <span className="block text-[16px] font-semibold leading-tight">{Number(x.date.slice(8))}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium truncate">{x.title}</span>
              <span className="block text-[11.5px] text-muted truncate">{x.sub}</span>
            </span>
            <span className={`text-[12px] flex-shrink-0 ${n <= 3 ? "text-[#B42318] font-medium" : "text-muted"}`}>{n === 0 ? "Today" : n === 1 ? "Tomorrow" : `in ${n} days`}</span>
          </>
        );
        return x.href ? (
          <Link key={x.key} href={x.href} className={`${ROW} font-normal`}>
            {inner}
          </Link>
        ) : (
          <button key={x.key} onClick={x.open!} className={`${ROW} font-normal text-left`}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}

function Leads({ size }: { size: WidgetSize }) {
  const data = useJson<{ leads?: { status: string; createdAt: string; firstName: string; lastName: string; company: string }[] }>("/api/leads");
  if (!data) return <div className="text-[13px] text-muted m-auto">Loading…</div>;
  const leads = data.leads ?? [];
  const since = nowMs() - 30 * 86400000;
  const recent = leads.filter((l) => Date.parse(l.createdAt) >= since);
  const fresh = leads.filter((l) => l.status === "new").length;
  if (size === "s") return <Big n={fresh} label={fresh === 1 ? "new lead to contact" : "new leads to contact"} sub={`${recent.length} in 30 days`} />;
  const label: Record<string, string> = { new: "New", contacted: "Contacted", invited: "Link sent", converted: "Became clients", declined: "Declined" };
  const rows = ["new", "contacted", "invited", "converted", "declined"].map((s) => ({ label: label[s], n: recent.filter((l) => l.status === s).length, href: "/dashboard/leads" })).filter((r) => r.n);
  if (!rows.length) return <Empty icon={Funnel} title="No leads in 30 days" sub="Website and intake-link leads show up here." />;
  return <Bars rows={rows} total={recent.length} />;
}

function Calls({ size }: { size: WidgetSize }) {
  const data = useJson<{ items?: { occurredAt: string; callbackNeeded: boolean; callbackDoneAt: string | null; contactName: string; contactPhone: string }[] }>("/api/communications?view=calls");
  if (!data) return <div className="text-[13px] text-muted m-auto">Loading…</div>;
  const items = data.items ?? [];
  const today = ymd(new Date());
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const n = items.filter((c) => ymd(new Date(c.occurredAt)) === today).length;
  const yn = items.filter((c) => ymd(new Date(c.occurredAt)) === ymd(y)).length;
  const callbacks = items.filter((c) => c.callbackNeeded && !c.callbackDoneAt);
  if (size === "s") return <Big n={n} label={n === 1 ? "call logged today" : "calls logged today"} sub={`${yn} yesterday`} />;
  return (
    <div className="mt-auto">
      <div className="flex items-end gap-6 mb-3">
        <Big n={n} label="calls today" />
        <Big n={callbacks.length} label="need a call back" />
      </div>
      <Link href="/dashboard/communications?view=calls" className={PILL + " w-fit"}>
        Phone logs <ArrowUpRight size={12} />
      </Link>
    </div>
  );
}

function Outstanding() {
  const data = useJson<{ balances?: { owed: number; overdue: number }[]; invoices?: { status: string }[] }>("/api/invoices");
  if (!data) return <div className="text-[13px] text-muted m-auto">Loading…</div>;
  const owed = (data.balances ?? []).reduce((n, b) => n + b.owed, 0);
  const overdue = (data.balances ?? []).reduce((n, b) => n + b.overdue, 0);
  const pending = (data.invoices ?? []).filter((i) => i.status === "pending").length;
  const $ = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  return <Big n={$(owed)} label="still owed on invoices" sub={<>{overdue > 0 && <span className="text-[#B42318]">{$(overdue)} overdue · </span>}{pending} waiting for approval</>} />;
}

function AskAi() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const go = () => q.trim() && router.push(`/dashboard/agent?q=${encodeURIComponent(q.trim())}`);
  return (
    <div className="mt-auto flex items-center gap-2 bg-[#F3F2F0] rounded-full pl-4 pr-1.5 py-1.5 border border-[#E9E7E4]">
      <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder="A question about a matter, a client or the law" aria-label="Ask the AI Agent" className="flex-1 min-w-0 bg-transparent outline-none text-[13.5px] placeholder:text-muted" />
      <button onClick={go} disabled={!q.trim()} aria-label="Ask" className="w-8 h-8 rounded-full bg-btn hover:bg-btn-hover flex items-center justify-center disabled:opacity-50">
        <ArrowUp size={15} />
      </button>
    </div>
  );
}

// An analog clock: white face, bold minute marks, numbers, black hands and a
// thin gold second hand that sweeps smoothly; the time in digits below.
function ClockFace() {
  const [label, setLabel] = useState<string | null>(null);
  const hourRef = useRef<SVGGElement>(null);
  const minRef = useRef<SVGGElement>(null);
  const secRef = useRef<SVGGElement>(null);
  useEffect(() => {
    let raf = 0;
    let lastMinute = -1;
    const tick = () => {
      const d = new Date();
      const sec = d.getSeconds() + d.getMilliseconds() / 1000;
      const min = d.getMinutes() + sec / 60;
      const hr = (d.getHours() % 12) + min / 60;
      // Move the hands directly (no re-render 60 times a second).
      if (secRef.current) secRef.current.setAttribute("transform", `rotate(${sec * 6} 100 100)`);
      if (minRef.current) minRef.current.setAttribute("transform", `rotate(${min * 6} 100 100)`);
      if (hourRef.current) hourRef.current.setAttribute("transform", `rotate(${hr * 30} 100 100)`);
      if (d.getMinutes() !== lastMinute) {
        lastMinute = d.getMinutes();
        setLabel(d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    // The face takes about 70% of the widget, so it grows and shrinks with it (and stays round).
    <div className="flex-1 min-h-0 w-full flex items-center justify-center">
      <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet" className="w-[70%] h-[70%]" aria-label={label ?? "Clock"}>
        <circle className="lp-clock-face" cx="100" cy="100" r="98" fill="#fff" />
        {[...Array(60)].map((_, i) => (
          <line key={i} x1="100" y1="5" x2="100" y2={i % 5 ? "12" : "17"} className="lp-clock-ink" stroke="#141414" strokeWidth={i % 5 ? 2.2 : 5} strokeLinecap="round" transform={`rotate(${i * 6} 100 100)`} />
        ))}
        {[...Array(12)].map((_, i) => {
          const n = i + 1;
          const ang = (n * 30 * Math.PI) / 180;
          return (
            <text key={n} x={100 + 70 * Math.sin(ang)} y={100 - 70 * Math.cos(ang)} textAnchor="middle" dominantBaseline="central" className="lp-clock-num" fontSize="18" fill="#1B1B1B" fontFamily="Helvetica, Arial, sans-serif">
              {n}
            </text>
          );
        })}
        <g ref={hourRef}>
          <line className="lp-clock-ink" x1="100" y1="104" x2="100" y2="50" stroke="#141414" strokeWidth="9" strokeLinecap="round" />
        </g>
        <g ref={minRef}>
          <line className="lp-clock-ink" x1="100" y1="106" x2="100" y2="18" stroke="#141414" strokeWidth="5" strokeLinecap="round" />
        </g>
        <g ref={secRef}>
          <line x1="100" y1="114" x2="100" y2="20" stroke="#E2A43A" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="100" cy="100" r="7.5" fill="#E2A43A" />
        </g>
      </svg>
    </div>
  );
}

// The current time for the Clock widget's title ("9:03 AM").
function LiveTime() {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    const show = () => setT(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    const t0 = setTimeout(show, 0);
    const iv = setInterval(show, 5000);
    return () => (clearTimeout(t0), clearInterval(iv));
  }, []);
  return <span className="tabular-nums">{t ?? "Clock"}</span>;
}

// Due today (count): the number, plus the tasks themselves (yours first), and
// what's overdue when nothing is due today.
function DueTodayCount({ d }: { d: DashData }) {
  const small = useSmall();
  const me = (d.meEmail ?? "").toLowerCase();
  const open = d.allTasks.filter((t) => t.status !== "done");
  const due = open.filter((t) => t.dueDate === d.todayStr);
  const late = open.filter((t) => isOverdue(t));
  const mine = (t: (typeof open)[number]) => (t.assignee ?? "").toLowerCase() === me;
  const myDue = due.filter(mine).length;
  const list = (due.length ? due : late).slice().sort((a, b) => Number(mine(b)) - Number(mine(a)) || (PRI_RANK[a.priority] ?? 3) - (PRI_RANK[b.priority] ?? 3));
  if (!d.tasksLoaded) return <div className="text-[14px] text-muted m-auto">Loading tasks…</div>;
  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-end gap-3">
        <div className={`${small ? "text-[30px]" : "text-[38px]"} leading-none font-display font-semibold tabular-nums`}>{due.length}</div>
        <div className={`${small ? "text-[12px]" : "text-[13px]"} text-muted pb-0.5 leading-snug`}>
          {due.length ? `due today · ${myDue} yours` : "nothing due today"}
          {late.length > 0 && (
            <>
              <br />
              <span className="text-[#B42318] font-medium">{late.length} overdue</span>
            </>
          )}
        </div>
      </div>
      {list.length > 0 ? (
        <div className="mt-2.5 flex flex-col min-h-0 flex-1 overflow-y-auto -mx-1">
          {!due.length && <div className="px-1 pb-1 font-mono text-[10.5px] uppercase tracking-wider text-[#B42318]">Overdue</div>}
          {list.map((t) => (
            <button key={t.id} onClick={() => d.openTask(t)} className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-[#F3F2F0] text-left min-w-0">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: priorityMeta[t.priority]?.bg }} />
              <span className={`flex-1 min-w-0 truncate ${small ? "text-[12.5px]" : "text-[13.5px]"} ${mine(t) ? "font-medium" : ""}`}>{t.title}</span>
              {!small && <span className="text-[11.5px] text-muted flex-shrink-0">{t.assignee ? firstName(d, t.assignee) : "Unassigned"}</span>}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-auto text-[12.5px] text-muted">All caught up.</div>
      )}
    </div>
  );
}

function Note() {
  const [v, setV] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setV(localStorage.getItem("lawpower.dashboard.note") ?? "");
      } catch {
        /* private mode */
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  return (
    <textarea
      value={v}
      onChange={(e) => {
        setV(e.target.value);
        try {
          localStorage.setItem("lawpower.dashboard.note", e.target.value);
        } catch {
          /* private mode */
        }
      }}
      placeholder="Jot something down. It stays on this computer."
      aria-label="Note"
      className="lp-note-lines flex-1 min-h-0 w-full bg-transparent resize-none outline-none text-[14.5px] placeholder:text-[#A99D73]"
    />
  );
}

function Shortcuts() {
  const items: [string, string, React.ComponentType<{ size?: number }>][] = [
    ["AI Agent", "/dashboard/agent", Sparkles],
    ["New matter", "/dashboard/matters?new=1", Folder],
    ["New client", "/dashboard/client-intake", UserPlus],
    ["Workflow", "/dashboard/task-board", ListChecks],
    ["Inbox", "/dashboard/inbox", Inbox],
    ["Calendar", "/dashboard/calendar", Calendar],
  ];
  return (
    <div className="mt-auto grid grid-cols-3 sm:grid-cols-6 gap-2">
      {items.map(([label, href, Icon]) => (
        <Link key={label} href={href} className="flex flex-col items-center gap-1.5 group/sc">
          <span className="w-11 h-11 rounded-2xl bg-btn group-hover/sc:bg-btn-hover flex items-center justify-center text-ink transition-colors">
            <Icon size={17} />
          </span>
          <span className="text-[11.5px] font-medium text-center leading-tight">{label}</span>
        </Link>
      ))}
    </div>
  );
}

// ── the library ──────────────────────────────────────────────────────────────
const viewAll = (href: string, label: string) => (
  <Link href={href} className="flex items-center gap-0.5 text-[13px] font-medium text-ink hover:underline underline-offset-2">
    {label} <ChevronRight size={15} strokeWidth={2} />
  </Link>
);

export const WIDGETS: WidgetDef[] = [
  // Tasks
  { id: "due", name: "Due today", desc: "Tasks due today (or this week / month), by board.", category: "Tasks", sizes: ["s", "m", "l"], size: "s", icon: ListChecks, title: (d) => d.dueLabel, action: (d) => viewAll(`/dashboard/task-board?due=${d.range}`, "View all tasks"), body: (d, size) => <DueCard d={d} small={size === "s"} /> },
  { id: "priority", name: "Due by priority", desc: "High, medium and low priority tasks due. Click one to filter the Tasks widget.", category: "Tasks", sizes: ["s", "m", "l"], size: "s", icon: Flag, title: (d) => `${d.dueLabel} by priority`, body: (d, size) => <PriorityCard d={d} small={size === "s"} /> },
  { id: "tasks", name: "Tasks", desc: "The tasks due, and those with no due date. Tick one off right here.", category: "Tasks", sizes: ["m", "l", "w", "xl"], size: "m", icon: ListChecks, action: () => viewAll("/dashboard/task-board", "Open Workflow"), body: (d) => <TasksList d={d} /> },
  { id: "activity", name: "Recent activity", desc: "Tasks created, updated and completed, newest first.", category: "Tasks", sizes: ["m", "l", "xl"], size: "m", icon: Activity, body: (d) => <RecentActivity d={d} /> },
  { id: "teamProgress", name: "Team progress", desc: "Each person's tasks: completed on time, completed, open and overdue.", category: "Tasks", sizes: ["m", "l", "w", "xl"], size: "m", icon: BarChart3, body: (d) => <TeamProgress tasks={d.allTasks} members={d.teamMembers} className="h-full min-h-0 scroll-on-hover" hideLabel onPick={(email) => d.setScope(email)} /> },
  { id: "myTasksScoped", name: "My tasks", desc: "Always your own tasks (even when View Team Tasks shows someone else): overdue first, then due today / this week / month, then no due date.", category: "Tasks", sizes: ["m", "l", "w", "xl"], size: "l", icon: UserRound, title: (d) => `My tasks · ${d.rangeWord}`, body: (d) => <ScopedTasks d={d} /> },
  { id: "teamTasks", name: "Team tasks", desc: "Always the whole team's open tasks, with who each one belongs to: overdue first, then due today / this week / month.", category: "Tasks", sizes: ["m", "l", "w", "xl"], size: "l", icon: Users, title: (d) => `Team tasks · ${d.rangeWord}`, body: (d) => <ScopedTasks d={d} team /> },
  { id: "myTasks", name: "My open tasks", desc: "Your open tasks, soonest first. Tick one off without leaving the Dashboard.", category: "Tasks", sizes: ["m", "l"], size: "l", icon: CheckCircle2, body: (d) => <MyOpenTasks d={d} /> },
  { id: "overdue", name: "Overdue", desc: "Open tasks past their due date across the firm.", category: "Tasks", sizes: ["s", "m"], size: "s", icon: AlarmClock, body: (d) => { const n = d.allTasks.filter(isOverdue).length; return <Big n={n} label={n ? "past their due date" : "Nothing overdue"} />; } },
  { id: "dueCount", name: "Due today (count)", desc: "Tasks due today across the firm: how many, how many are yours and overdue, and the tasks themselves.", category: "Tasks", sizes: ["s", "m", "l"], size: "s", icon: CalendarClock, title: () => "Due today", body: (d) => <DueTodayCount d={d} /> },
  { id: "doneWeek", name: "Done this week", desc: "Tasks the firm finished in the last seven days.", category: "Tasks", sizes: ["m"], size: "m", icon: CheckCircle2, body: (d) => <DoneThisWeek d={d} /> },
  { id: "unassigned", name: "Unassigned", desc: "Open tasks that still need an owner.", category: "Tasks", sizes: ["s", "m"], size: "s", icon: UserX, body: (d) => { const n = d.allTasks.filter((t) => t.status !== "done" && !t.assignee).length; return <Big n={n} label={n ? "need an owner" : "Every task has an owner"} />; } },
  { id: "workload", name: "Workload", desc: "Open tasks per person, and how many are late. Click a name to see their tasks.", category: "Tasks", sizes: ["m", "l"], size: "m", icon: Users, body: (d) => <Workload d={d} /> },

  // Calendar
  { id: "calendar", name: "Calendar", desc: "Your Outlook or Google events today, this week or this month.", category: "Calendar", sizes: ["s", "m", "l"], size: "s", icon: Calendar, action: () => viewAll("/dashboard/calendar", "Open calendar"), body: (d, size) => <CalendarCard d={d} small={size === "s"} /> },
  { id: "events", name: "Events", desc: "Your events day by day, with times and places.", category: "Calendar", sizes: ["m", "l", "xl"], size: "l", icon: Calendar, action: () => viewAll("/dashboard/calendar", "Open calendar"), body: (d) => <Events d={d} /> },
  { id: "nextEvent", name: "Next meeting", desc: "Your next calendar event and how soon it starts.", category: "Calendar", sizes: ["s", "m"], size: "m", icon: Clock3, body: (d) => { const next = d.allEvents.filter((e) => !e.allDay && Date.parse(e.start) > Date.now()).sort((a, b) => a.start.localeCompare(b.start))[0]; if (!next) return <Empty icon={Clock3} title="Nothing coming up" />; const mins = Math.round((Date.parse(next.start) - Date.now()) / 60000); return <button onClick={() => d.openEvent(next)} className="mt-auto text-left"><div className="text-[13px] text-muted">{mins < 60 ? `in ${mins} min` : mins < 1440 ? `in ${Math.round(mins / 60)} h` : d.eventStart(next).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {d.fmtTime(next)}</div><div className="text-[18px] font-semibold leading-snug line-clamp-2">{next.title}</div>{next.location && <div className="text-[12.5px] text-muted truncate">{next.location}</div>}</button>; } },
  { id: "importantDates", name: "Important dates", desc: "Every task and matter deadline in the next 60 days, soonest first.", category: "Calendar", sizes: ["m", "l"], size: "l", icon: CalendarClock, body: (d) => <ImportantDates d={d} /> },
  { id: "nextDeadline", name: "Next deadline", desc: "A countdown to the nearest deadline on any task or matter.", category: "Calendar", sizes: ["s", "m"], size: "s", icon: Timer, body: (d) => { const x = upcoming(d)[0]; if (!x) return <Empty icon={Timer} title="No dates ahead" />; const n = daysUntil(x.date); return <Big n={n === 0 ? "Today" : `${n}d`} label={x.title} sub={fmtDay(x.date)} />; } },

  // Matters
  { id: "openMatters", name: "Open matters", desc: "How many matters are open, and how many started in the last 30 days.", category: "Matters", sizes: ["s", "m"], size: "s", icon: Folder, body: (d) => { const open = d.matters.filter((m) => OPEN(m.status)); const since = Date.now() - 30 * 86400000; return <Big n={open.length} label="open" sub={`${d.matters.filter((m) => Date.parse(m.createdAt) >= since).length} opened in 30 days`} />; } },
  { id: "byStatus", name: "Matters by status", desc: "Where your open matters sit: lead, consultation, engaged, active.", category: "Matters", sizes: ["m", "l"], size: "m", icon: Layers, body: (d) => <MattersByStatus d={d} /> },
  { id: "practiceMix", name: "Practice mix", desc: "Open matters by practice area.", category: "Matters", sizes: ["m", "l"], size: "m", icon: PieChart, body: (d) => <PracticeMix d={d} /> },
  { id: "recentMatters", name: "Recently touched", desc: "The matters that changed most recently.", category: "Matters", sizes: ["m", "l"], size: "m", icon: History, body: (d) => <MatterRows compact d={d} list={[...d.matters].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 25)} right={(m) => timeAgo(m.updatedAt)} empty={<Empty icon={History} title="No matters yet" />} /> },
  { id: "myMatters", name: "My matters", desc: "Open matters assigned to you, with their due dates.", category: "Matters", sizes: ["m", "l"], size: "l", icon: UserRound, body: (d) => <MatterRows d={d} list={d.matters.filter((m) => OPEN(m.status) && (m.assignedTo ?? "").toLowerCase() === (d.meEmail ?? "").toLowerCase()).sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))} right={(m) => (m.dueDate ? fmtDay(m.dueDate) : "")} empty={<Empty icon={UserRound} title="Nothing assigned to you" sub="Matters where you're Assigned to show here." />} /> },
  { id: "goneQuiet", name: "Gone quiet", desc: "Open matters nobody has touched in three weeks.", category: "Matters", sizes: ["m", "l"], size: "m", icon: Hourglass, body: (d) => { const cut = Date.now() - 21 * 86400000; return <MatterRows d={d} list={d.matters.filter((m) => OPEN(m.status) && Date.parse(m.updatedAt) < cut).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))} right={(m) => timeAgo(m.updatedAt)} empty={<Empty icon={Hourglass} title="Everything is moving" sub="Every open matter changed in the last 21 days." />} />; } },

  // Clients and intake
  { id: "newClients", name: "New clients", desc: "Clients added or updated in the last 30 days.", category: "Clients and intake", sizes: ["s", "m"], size: "s", icon: UserPlus, body: (d) => { const since = Date.now() - 30 * 86400000; const n = d.clients.filter((c) => Date.parse(c.updatedAt) >= since).length; return <Big n={n} label="in the last 30 days" sub={`${d.clients.length} clients in all`} />; } },
  { id: "leads", name: "Potential leads", desc: "Leads from your website and intake link in the last 30 days, by where they stand.", category: "Clients and intake", sizes: ["s", "m", "l"], size: "m", icon: Funnel, action: () => viewAll("/dashboard/leads", "Open"), body: (_d, size) => <Leads size={size} /> },
  { id: "calls", name: "Calls", desc: "Phone calls logged today, and the ones that need a call back.", category: "Clients and intake", sizes: ["s", "m"], size: "m", icon: Phone, body: (_d, size) => <Calls size={size} /> },

  // Firm
  { id: "team", name: "Team", desc: "Who is in the firm.", category: "Firm", sizes: ["s", "m"], size: "s", icon: Users, body: (d) => <div className="mt-auto"><div className="flex -space-x-2 mb-2">{d.teamMembers.slice(0, 6).map((m) => <span key={m.id} className="w-8 h-8 rounded-full bg-white border-2 border-card-alt flex items-center justify-center text-[11px] font-semibold text-muted" title={m.fullName || m.email}>{(m.fullName || m.email).split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase()}</span>)}</div><div className="text-[13px] text-muted">{d.teamMembers.length} {d.teamMembers.length === 1 ? "person" : "people"}</div></div> },
  { id: "outstanding", name: "Outstanding balance", desc: "What clients still owe on approved invoices, and what's overdue.", category: "Firm", sizes: ["s", "m"], size: "m", icon: Receipt, action: () => viewAll("/dashboard/ai-accountant?tab=invoices", "Invoices"), body: () => <Outstanding /> },

  // AI and tools
  { id: "askAi", name: "Ask the AI Agent", desc: "Ask a question from the Dashboard; the AI Agent opens with it.", category: "AI and tools", sizes: ["m", "w"], size: "m", icon: Sparkles, tone: "bg-[#F3F2F0]", body: () => <AskAi /> },
  { id: "search", name: "Search", desc: "Search matters, contacts, documents, tasks and more.", category: "AI and tools", sizes: ["m", "w"], size: "m", icon: Search, body: () => <button onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, metaKey: true }))} className="mt-auto flex items-center gap-2 bg-[#F3F2F0] border border-[#E9E7E4] rounded-full px-4 py-2.5 text-[13.5px] text-muted text-left hover:bg-[#EFEEEB]"><Search size={14} /> Search everything… <kbd className="ml-auto text-[11px] bg-card-alt rounded px-1.5">Ctrl K</kbd></button> },
  { id: "shortcuts", name: "Shortcuts", desc: "One click to the things you start most.", category: "AI and tools", sizes: ["m", "w"], size: "m", icon: Zap, body: () => <Shortcuts /> },
  { id: "clock", name: "Clock", desc: "The time, with a face you can read at a glance. The face grows with the widget.", category: "AI and tools", sizes: ["s", "m", "l"], size: "s", icon: Clock3, title: () => <LiveTime />, body: () => <ClockFace /> },
  { id: "note", name: "Note", desc: "A sticky note that stays on this computer.", category: "AI and tools", sizes: ["s", "m", "l"], size: "s", icon: StickyNote, tone: "bg-[#F4EDCF]", inner: "bg-[#FFFAE6]", body: () => <Note /> },
];

export const WIDGET = (id: string) => WIDGETS.find((w) => w.id === id);

// The standard Dashboard for everyone (Nov 1). Five across on a wide screen:
// Due today · Due by priority · Due today (count) · Calendar · Note
// Tasks (2) · Recent activity (2) · Clock
// Team progress (2) · Events (2)
export const DEFAULT_LAYOUT: { id: string; size: WidgetSize }[] = [
  { id: "due", size: "s" },
  { id: "priority", size: "s" },
  { id: "dueCount", size: "s" },
  { id: "calendar", size: "s" },
  { id: "note", size: "s" },
  { id: "tasks", size: "m" },
  { id: "activity", size: "m" },
  { id: "clock", size: "s" },
  { id: "teamProgress", size: "m" },
  { id: "events", size: "m" },
];
// Bump this to give everyone the standard layout again (their later changes are kept).
export const LAYOUT_VERSION = "v5";
