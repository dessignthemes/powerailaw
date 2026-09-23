"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import TimeSlider from "@/components/TimeSlider";
import TaskFilterDropdown from "@/components/TaskFilterDropdown";
import TaskDetailModal from "@/components/TaskDetailModal";
import { BoardTask, priorityMeta, statusMeta } from "@/components/NewTaskModal";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import { isDueIn, ymd } from "@/lib/taskDates";
import {
  ListChecks,
  Calendar,
  Timer,
  Activity,
  CalendarCheck,
  Circle,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";

const rangeTabs = [
  { key: "today", label: "Today", due: "Due today" },
  { key: "week", label: "Week", due: "Due this week" },
  { key: "nextweek", label: "Next week", due: "Due next week" },
] as const;

type RangeKey = (typeof rangeTabs)[number]["key"];

function formatDue(dueDate: string) {
  const [y, m, d] = dueDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function timeAgo(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DashboardHome() {
  const [range, setRange] = useState<RangeKey>("today");
  const [bottomTab, setBottomTab] = useState<"tasks" | "events">("tasks");

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const activeRange = rangeTabs.find((r) => r.key === range)!;

  const { tasks, tasksLoaded, updateTask } = useWorkspaceData();
  const [selectedTask, setSelectedTask] = useState<BoardTask | null>(null);

  const { dueTasks, undatedTasks, openCount, recent } = useMemo(() => {
    const open = tasks.filter((t) => t.status !== "done");
    const due = tasks
      .filter((t) => isDueIn(t, range))
      .sort((a, z) => (a.dueDate! < z.dueDate! ? -1 : 1));
    const undated = open.filter((t) => !t.dueDate);
    const rec = [...tasks]
      .filter((t) => t.updatedAt || t.createdAt)
      .sort((a, z) => ((z.updatedAt ?? z.createdAt)! > (a.updatedAt ?? a.createdAt)! ? 1 : -1))
      .slice(0, 8);
    return { dueTasks: due, undatedTasks: undated, openCount: open.length, recent: rec };
  }, [tasks, range]);

  const todayStr = ymd(new Date());

  function toggleDone(t: BoardTask) {
    updateTask({ ...t, status: t.status === "done" ? "todo" : "done" });
  }

  function renderTaskRow(t: BoardTask) {
    const overdue = t.dueDate && t.dueDate < todayStr;
    const done = t.status === "done";
    return (
      <div
        key={t.id}
        onClick={() => setSelectedTask(t)}
        className="flex items-center justify-between gap-3 px-5 py-3.5 cursor-pointer hover:bg-card-alt/40 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleDone(t);
            }}
            className="text-muted hover:text-green-600 transition-colors flex-shrink-0"
            aria-label={done ? "Mark as not done" : "Mark as done"}
          >
            {done ? (
              <CheckCircle2 size={17} strokeWidth={1.75} className="text-green-600" />
            ) : (
              <Circle size={17} strokeWidth={1.75} />
            )}
          </button>
          <span className={`text-[14.5px] font-medium truncate ${done ? "line-through text-muted" : ""}`}>
            {t.title}
          </span>
          <span className="text-[12px] text-muted flex-shrink-0">{statusMeta[t.status].label}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {t.dueDate && (
            <span className={`mono text-[12px] ${overdue ? "text-red-600" : "text-muted"}`}>
              {overdue ? "Overdue · " : ""}
              {formatDue(t.dueDate)}
            </span>
          )}
          <span
            className="text-[12px] font-medium px-2.5 py-1 rounded-full"
            style={{ backgroundColor: priorityMeta[t.priority].bg, color: priorityMeta[t.priority].text }}
          >
            {t.priority}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="px-10 py-10">
      <div className="flex items-start justify-between mb-10">
        <div>
          <h1 className="text-[32px] font-semibold mb-1">Good afternoon</h1>
          <div className="text-[14.5px] text-muted">{today}</div>
        </div>
        <TaskFilterDropdown />
      </div>

      <div className="flex gap-6 mb-8 text-[14px] font-medium text-muted border-b border-line">
        {rangeTabs.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`pb-3 flex items-center gap-1.5 transition-colors ${
              range === r.key
                ? "text-ink border-b-2 border-ink font-semibold"
                : "hover:text-ink"
            }`}
          >
            <Calendar size={15} strokeWidth={range === r.key ? 2 : 1.75} />
            {r.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Link
          href={`/dashboard/task-board?due=${range}`}
          className="group bg-card-alt rounded-2xl p-6 relative block hover:bg-line/40 transition-colors"
        >
          <div className="text-[13.5px] font-medium text-muted mb-8 flex items-center gap-1.5">
            <ListChecks size={15} strokeWidth={1.75} /> {activeRange.due}
          </div>
          <div className="absolute top-6 right-6 w-6 h-6 rounded-full border-2 border-line flex items-center justify-center text-muted group-hover:text-ink group-hover:border-ink transition-colors">
            <ArrowUpRight size={12} strokeWidth={2} />
          </div>
          <div className="text-[32px] font-display font-semibold mb-1">
            {tasksLoaded ? dueTasks.length : "–"} {dueTasks.length === 1 ? "task" : "tasks"}
          </div>
          <div className="text-[13px] text-muted">
            {openCount} open · {undatedTasks.length} with no due date
          </div>
          <div className="text-[12.5px] font-medium text-muted group-hover:text-ink mt-4 transition-colors">
            View on task board →
          </div>
        </Link>

        <div className="bg-card-alt rounded-2xl p-6">
          <div className="text-[13.5px] font-medium text-muted mb-8 flex items-center gap-1.5">
            <Calendar size={15} strokeWidth={1.75} /> Calendar
          </div>
          <div className="text-[32px] font-display font-semibold mb-1">0 events</div>
          <div className="text-[13px] text-muted mb-2">Nothing scheduled today</div>
          <TimeSlider />
        </div>

        <div className="bg-card-alt rounded-2xl p-6">
          <div className="text-[13.5px] font-medium text-muted mb-8 flex items-center gap-1.5">
            <Timer size={15} strokeWidth={1.75} /> Tracked
          </div>
          <div className="text-[32px] font-display font-semibold mb-1">0m</div>
          <div className="text-[13px] text-muted mb-2">0m this week</div>
          <TimeSlider />
        </div>
      </div>

      <div className="bg-card-alt rounded-2xl p-6 mt-5">
        <div className="flex gap-6 text-[14px] font-medium text-muted mb-6">
          <button
            onClick={() => setBottomTab("tasks")}
            className={`pb-2 flex items-center gap-1.5 transition-colors ${
              bottomTab === "tasks"
                ? "text-ink border-b-2 border-ink font-semibold"
                : "hover:text-ink"
            }`}
          >
            <ListChecks size={15} strokeWidth={bottomTab === "tasks" ? 2 : 1.75} /> Tasks
          </button>
          <button
            onClick={() => setBottomTab("events")}
            className={`pb-2 flex items-center gap-1.5 transition-colors ${
              bottomTab === "events"
                ? "text-ink border-b-2 border-ink font-semibold"
                : "hover:text-ink"
            }`}
          >
            <Calendar size={15} strokeWidth={bottomTab === "events" ? 2 : 1.75} /> Events
          </button>
        </div>
        {bottomTab === "tasks" && (dueTasks.length > 0 || undatedTasks.length > 0) ? (
          <div className="bg-cream rounded-xl min-h-[520px] py-2">
            {dueTasks.length > 0 && (
              <>
                <div className="px-5 pt-3 pb-1 flex items-center justify-between">
                  <span className="mono text-[11px] uppercase tracking-wider text-muted">{activeRange.due}</span>
                  <Link
                    href={`/dashboard/task-board?due=${range}`}
                    className="text-[12.5px] font-medium text-muted hover:text-ink transition-colors"
                  >
                    View all {dueTasks.length} →
                  </Link>
                </div>
                <div className="divide-y divide-line">
                  {dueTasks.map(renderTaskRow)}
                </div>
              </>
            )}
            {dueTasks.length === 0 && (
              <div className="px-5 py-6 text-[14px] text-muted">
                Nothing due {range === "today" ? "today" : range === "week" ? "this week" : "next week"}.
              </div>
            )}
            {undatedTasks.length > 0 && (
              <>
                <div className="px-5 pt-5 pb-1 mono text-[11px] uppercase tracking-wider text-muted">
                  No due date
                </div>
                <div className="divide-y divide-line">
                  {undatedTasks.map(renderTaskRow)}
                </div>
              </>
            )}
            <div className="px-5 pt-5 pb-3">
              <Link
                href="/dashboard/task-board"
                className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink transition-colors"
              >
                Open task board <ArrowUpRight size={13} strokeWidth={1.75} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-cream rounded-xl flex flex-col items-center justify-center min-h-[520px] text-center">
            <div className="w-8 h-8 rounded-md border border-line flex items-center justify-center text-muted mb-3">
              <CalendarCheck size={16} strokeWidth={1.75} />
            </div>
            <div className="text-[15px] font-medium">
              {bottomTab === "tasks" && !tasksLoaded
                ? "Loading tasks…"
                : `${bottomTab === "tasks" ? "Nothing due" : "Nothing scheduled"} ${
                    range === "today" ? "today" : range === "week" ? "this week" : "next week"
                  }`}
            </div>
          </div>
        )}
      </div>

      <div className="bg-card-alt rounded-2xl p-6 mt-5">
        <div className="text-[14px] font-medium text-ink mb-6 flex items-center gap-1.5">
          <Activity size={15} strokeWidth={1.75} /> Recent activity
        </div>
        {recent.length === 0 ? (
          <div className="bg-cream rounded-xl flex flex-col items-center justify-center min-h-[420px] text-center">
            <Activity size={20} strokeWidth={1.5} className="text-muted mb-3" />
            <div className="text-[15px] font-medium text-muted">No activity yet</div>
          </div>
        ) : (
          <div className="bg-cream rounded-xl divide-y divide-line">
            {recent.map((t) => {
              const created =
                !t.updatedAt || !t.createdAt || Math.abs(new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime()) < 2000;
              const verb = created ? "Created" : t.status === "done" ? "Completed" : "Updated";
              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTask(t)}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 cursor-pointer hover:bg-card-alt/40 transition-colors"
                >
                  <div className="text-[14px] truncate">
                    <span className="text-muted">{verb} task</span>{" "}
                    <span className="font-medium">{t.title}</span>
                  </div>
                  <span className="mono text-[12px] text-muted flex-shrink-0">
                    {timeAgo((t.updatedAt ?? t.createdAt)!)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={(updated) => {
            updateTask(updated);
            setSelectedTask(updated);
          }}
        />
      )}
    </div>
  );
}
