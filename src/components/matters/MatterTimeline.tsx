"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, CircleDashed, Loader2, ArrowUpRight, GitBranch } from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import { autoStatus, dueState, progress, type TaskChecklist } from "@/lib/checklist";
import type { BoardTask } from "@/components/NewTaskModal";
import type { Matter } from "@/components/NewMatterModal";
import { frameOuter, frameInner, frameTitle, pageBtnB } from "@/lib/ui";

// The matter's timeline: its workflow card (the same one on the task board),
// step by step. Ticking a step here ticks it on the board card and moves the
// card to the right column; dragging the card on the board is always allowed.

const usShort = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function MatterTimeline({ matter, workflowTaskId, onCreated }: { matter: Matter; workflowTaskId?: string | null; onCreated?: () => void }) {
  const { tasks, tasksLoaded, updateTask, boards, refreshAll } = useWorkspaceData();
  const flows = useMemo(() => {
    const list = tasks.filter((t) => t.matterId === matter.id && (t.checklist?.sections.length ?? 0) > 0);
    return list.sort((a, b) => Number(b.id === workflowTaskId) - Number(a.id === workflowTaskId));
  }, [tasks, matter.id, workflowTaskId]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/matters/${matter.id}/key-dates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "workflow" }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? "The workflow couldn't be created. Please try again.");
      refreshAll();
      onCreated?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  if (!tasksLoaded) {
    return (
      <div className="flex items-center gap-2 text-[14px] text-muted py-10 justify-center">
        <Loader2 size={15} className="animate-spin" /> Loading the workflow…
      </div>
    );
  }
  if (!flows.length) {
    return (
      <div className={frameOuter}>
        <div className="px-3 pt-2.5 pb-2.5">
          <span className={frameTitle}>
            <GitBranch size={13} /> Workflow
          </span>
        </div>
        <div className={`${frameInner} p-8 text-center`}>
          <div className="text-[15px] font-semibold mb-1">No workflow yet</div>
          <p className="text-[13.5px] text-muted max-w-[520px] mx-auto mb-4">
            It&apos;s made automatically from the firm&apos;s workflow template once attorney review concludes and the key dates are in. It&apos;s the same card as on the Workflow board, so the two stay in step.
          </p>
          <button onClick={() => void create()} disabled={creating} className={`${pageBtnB} mx-auto disabled:opacity-60`}>
            {creating ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
            {creating ? "Creating…" : "Create workflow now"}
          </button>
          {error && <div className="mt-3 text-[13px] text-[#B42318]">{error}</div>}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {flows.map((t) => (
        <Flow key={t.id} task={t} boardName={boards.find((b) => b.id === t.boardId)?.name ?? null} onChange={updateTask} />
      ))}
    </div>
  );
}

function Flow({ task, boardName, onChange }: { task: BoardTask; boardName: string | null; onChange: (t: BoardTask) => void }) {
  const c = task.checklist as TaskChecklist;
  const p = progress(c);
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  const firstOpen = (() => {
    for (const s of c.sections) for (const i of s.items) if (!i.done && !i.na) return i.id;
    return null;
  })();
  // The board column the card is in now.
  const [columns, setColumns] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    let live = true;
    fetch(`/api/board-columns?board=${encodeURIComponent(task.boardId ?? "general")}`)
      .then((r) => (r.ok ? r.json() : { columns: [] }))
      .then((d) => live && setColumns((d.columns ?? []) as { id: string; title: string }[]))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [task.boardId]);
  const columnName = columns.find((col) => col.id === task.columnId)?.title ?? ({ todo: "To do", inprogress: "In progress", waiting: "Waiting", done: "Done" } as const)[task.status];

  function save(next: TaskChecklist) {
    const moved = autoStatus(task.status, c, next);
    onChange({ ...task, checklist: next, ...(moved ? { status: moved } : {}) });
  }
  function toggle(sectionId: string, itemId: string) {
    const now = new Date().toISOString();
    save({
      ...c,
      sections: c.sections.map((s) =>
        s.id !== sectionId ? s : { ...s, items: s.items.map((i) => (i.id === itemId ? { ...i, done: !i.done, doneAt: !i.done ? now : null } : i)) }
      ),
    });
  }

  return (
    <div className={frameOuter}>
      <div className="flex items-center gap-3 flex-wrap px-3 pt-2.5 pb-2.5">
        <span className={frameTitle}>
          <GitBranch size={13} /> Workflow · {(c.templates ?? []).join(", ") || task.title}
        </span>
        <span className="ml-auto flex items-center gap-2 flex-wrap text-[12.5px]">
          <span className="text-muted">
            On {boardName ?? "the Workflow board"}: <b className="text-ink font-medium">{columnName}</b>
          </span>
          <label className="flex items-center gap-1.5 text-muted cursor-pointer" title="Ticking steps moves the card to the column for the next step. You can still drag it on the board.">
            <input type="checkbox" checked={c.auto !== false} onChange={(e) => save({ ...c, auto: e.target.checked ? undefined : false })} className="accent-[#1b191a]" />
            Move automatically
          </label>
          <Link href={`/dashboard/task-board?board=${task.boardId ?? "general"}`} className="flex items-center gap-1 font-medium underline underline-offset-2">
            Open Workflow board <ArrowUpRight size={13} />
          </Link>
        </span>
      </div>
      <div className={`${frameInner} p-5`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-1.5 rounded-full bg-[#F3F2F0] overflow-hidden">
            <div className="h-full rounded-full bg-[#2F9E5A] transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[12.5px] text-muted flex-shrink-0">
            <b className="text-ink font-medium">{p.done}</b> of {p.total} steps done
          </span>
        </div>
        <ol className="relative">
          {c.sections.map((s, si) => {
            const open = s.items.filter((i) => !i.done && !i.na).length;
            const stageDone = s.items.length > 0 && open === 0;
            const current = s.items.some((i) => i.id === firstOpen);
            return (
              <li key={s.id} className="relative pl-8 pb-5 last:pb-0">
                {si < c.sections.length - 1 && <span className="absolute left-[11px] top-6 bottom-0 w-px bg-[#E6E4E0]" aria-hidden />}
                <span
                  className={`absolute left-0 top-0.5 w-[23px] h-[23px] rounded-full flex items-center justify-center border ${
                    stageDone ? "bg-[#E8F6EE] border-[#B9D6B2] text-[#1F7A4D]" : current ? "bg-[#1b191a] border-[#1b191a] text-white" : "bg-white border-[#DAD7D1] text-muted"
                  }`}
                  aria-hidden
                >
                  {stageDone ? <Check size={12} strokeWidth={2.5} /> : <span className="text-[10.5px] font-semibold">{si + 1}</span>}
                </span>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[14px] font-semibold">{s.title}</span>
                  {current && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-[#1b191a] text-white">Now</span>}
                  <span className="text-[12px] text-muted">{stageDone ? "Done" : `${s.items.length - open} of ${s.items.filter((i) => !i.na).length}`}</span>
                </div>
                <div className="flex flex-col gap-1">
                  {s.items.map((i) => {
                    const d = dueState(i, c.dates);
                    const isNext = i.id === firstOpen;
                    return (
                      <div
                        key={i.id}
                        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 ${isNext ? "bg-[#F3F2F0]" : "hover:bg-[#FAFAF9]"} ${i.na ? "opacity-50" : ""}`}
                      >
                        <button
                          onClick={() => toggle(s.id, i.id)}
                          disabled={i.na}
                          aria-label={i.done ? `Mark “${i.text}” not done` : `Mark “${i.text}” done`}
                          className={`w-[18px] h-[18px] rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                            i.done ? "bg-[#2F9E5A] border-[#2F9E5A] text-white" : "border-[#C9C6BF] hover:border-[#2F9E5A]"
                          }`}
                        >
                          {i.done ? <Check size={11} strokeWidth={3} /> : i.na ? <CircleDashed size={11} /> : null}
                        </button>
                        <span className={`flex-1 min-w-0 truncate text-[13.5px] ${i.done ? "text-muted line-through" : ""}`}>{i.text}</span>
                        <span
                          className={`text-[12px] flex-shrink-0 ${
                            i.na ? "text-muted" : d.state === "overdue" ? "text-[#B42318] font-medium" : d.state === "today" ? "text-[#8A4B14] font-medium" : "text-muted"
                          }`}
                        >
                          {i.na
                            ? "N/A"
                            : i.done
                              ? i.doneAt
                                ? `Done ${usShort(i.doneAt.slice(0, 10))}`
                                : "Done"
                              : d.due
                                ? `${d.state === "overdue" ? "Overdue · " : d.state === "today" ? "Today · " : "Due "}${usShort(d.due)}`
                                : i.anchor
                                  ? `${i.anchor.replace(/ date$/i, "")} not set`
                                  : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
