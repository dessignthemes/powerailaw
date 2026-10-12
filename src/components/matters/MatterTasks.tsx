"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListChecks, Plus, X, Loader2, ArrowRight, CalendarDays, User, Flag, LayoutList } from "lucide-react";
import NewTaskModal, { GenericDropdown, priorityMeta, statusMeta, type BoardTask, type TaskPriority } from "@/components/NewTaskModal";
import TaskDetailModal from "@/components/TaskDetailModal";
import AssigneeOptions from "@/components/AssigneeOptions";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import { useTemplates } from "@/components/templates/useTemplates";
import { applyTemplate, anchorsOf, progress, alerts, nextStep, type TaskTemplate } from "@/lib/checklist";
import type { Matter } from "@/components/NewMatterModal";
import { boardForMatter } from "@/lib/matters/boards";

const boardHref = (boardId: string | null | undefined) => `/dashboard/task-board?board=${boardId ?? "general"}`;
const itemCount = (t: TaskTemplate) => t.sections.reduce((n, s) => n + s.items.length, 0);
const fmtDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

// Templates meant for this matter first (by abbreviation), then the rest.
export function templatesFor(templates: TaskTemplate[], code: string | null | undefined) {
  const suggested = code ? templates.filter((t) => (t.matterCodes ?? []).includes(code)) : [];
  return { suggested, others: templates.filter((t) => !suggested.includes(t)) };
}

// Tasks tab of a matter: create tasks from templates (they land on the Task Board, linked to this matter).
// keyDates = the matter's dates by checklist name ("Closing date" → "2026-11-20"); new tasks start with them.
export default function MatterTasks({ matter, clientName, keyDates = {} }: { matter: Matter; clientName: string | null; keyDates?: Record<string, string> }) {
  const { tasks, tasksLoaded, addTask, updateTask, boards } = useWorkspaceData();
  const { templates, error: templatesError } = useTemplates();
  const [fromTemplate, setFromTemplate] = useState<TaskTemplate | "pick" | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ title: string; boardId: string | null } | null>(null);

  const matterTasks = useMemo(() => {
    const list = tasks.filter((t) => t.matterId === matter.id);
    const key = (t: BoardTask) => `${t.status === "done" ? 1 : 0}${t.dueDate ?? "9999"}${t.createdAt ?? ""}`;
    return list.sort((a, b) => key(a).localeCompare(key(b)));
  }, [tasks, matter.id]);
  const { suggested } = templatesFor(templates ?? [], matter.matterCode);
  const openTask = matterTasks.find((t) => t.id === openTaskId) ?? null;
  const boardName = (id: string | null | undefined) => (id ? boards.find((b) => b.id === id)?.name ?? "Board" : "Main Task Board");

  function created(t: BoardTask) {
    addTask(t);
    setNotice({ title: t.title, boardId: t.boardId ?? null });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[15px] font-semibold mr-auto">
          Tasks{matter.matterNumber ? <span className="text-muted font-medium"> · {matter.matterNumber}</span> : null}
        </div>
        <button
          onClick={() => setFromTemplate("pick")}
          className="flex items-center gap-1.5 bg-btn hover:bg-btn-hover px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors"
        >
          <ListChecks size={14} strokeWidth={1.75} /> Add from template
        </button>
        <button
          onClick={() => setNewTaskOpen(true)}
          className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors"
        >
          <Plus size={14} strokeWidth={1.75} /> New task
        </button>
      </div>

      {notice && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#E8F6EE] px-4 py-3 text-[13px]">
          <span>
            <b>{notice.title}</b> was added to {boardName(notice.boardId)}.
          </span>
          <Link href={boardHref(notice.boardId)} className="font-medium underline underline-offset-2 flex items-center gap-1">
            Open Task Board <ArrowRight size={13} strokeWidth={1.75} />
          </Link>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="ml-auto text-muted hover:text-ink">
            <X size={14} strokeWidth={1.75} />
          </button>
        </div>
      )}

      {suggested.length > 0 && (
        <div>
          <div className="text-[12.5px] font-semibold text-muted mb-2">Templates for {matter.matterCode}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {suggested.map((t) => (
              <button
                key={t.id}
                onClick={() => setFromTemplate(t)}
                className="text-left rounded-2xl bg-[#E1E7F4] hover:bg-[#D5DDEE] transition-colors px-4 py-3.5 shadow-[0_1px_1px_rgba(27,25,26,0.08)]"
              >
                <div className="flex items-center gap-2">
                  <ListChecks size={15} strokeWidth={1.75} />
                  <span className="text-[14px] font-semibold truncate">{t.name}</span>
                  <ArrowRight size={14} strokeWidth={1.75} className="ml-auto flex-shrink-0" />
                </div>
                <div className="text-[12.5px] text-muted mt-1">
                  {t.sections.length} sections · {itemCount(t)} steps · Create task
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {templatesError && <div className="rounded-xl bg-[#FDF1E7] text-[#8A4B14] px-4 py-3 text-[13px]">{templatesError}</div>}

      <div className="rounded-2xl overflow-hidden border border-line">
        {!tasksLoaded ? (
          <div className="p-6 text-[13px] text-muted flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Loading tasks…
          </div>
        ) : matterTasks.length === 0 ? (
          <div className="p-8 flex flex-col items-center justify-center text-center gap-2">
            <ListChecks size={20} strokeWidth={1.5} className="text-muted" />
            <div className="text-[13.5px] font-medium">No tasks on this matter yet</div>
            <div className="text-[12.5px] text-muted max-w-[420px]">
              Use <b>Add from template</b> to create a task with the full checklist. It shows up on the Task Board, linked to this matter.
            </div>
          </div>
        ) : (
          matterTasks.map((t, i) => {
            const S = statusMeta[t.status];
            const cp = progress(t.checklist);
            const al = alerts(t.checklist);
            return (
              <button
                key={t.id}
                onClick={() => setOpenTaskId(t.id)}
                className={`w-full text-left flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 hover:bg-card-alt transition-colors ${i ? "border-t border-line" : ""} ${
                  t.status === "done" ? "opacity-60" : ""
                }`}
              >
                <S.icon size={15} strokeWidth={2} className={S.color} aria-label={S.label} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium truncate">{t.title}</span>
                  {t.status !== "done" && <NextStepLine task={t} />}
                </span>
                <span className="text-[11.5px] text-muted bg-card-alt rounded-md px-1.5 py-0.5 truncate max-w-[160px]">{boardName(t.boardId)}</span>
                {al.overdue > 0 && <span className="text-[11.5px] font-medium rounded-md px-1.5 py-0.5 bg-[#F9B2B3]">{al.overdue} overdue</span>}
                {al.overdue === 0 && al.soon > 0 && <span className="text-[11.5px] font-medium rounded-md px-1.5 py-0.5 bg-[#F9E1C0]">{al.soon} due soon</span>}
                {cp.total > 0 && (
                  <span className={`flex items-center gap-1 text-[11.5px] font-medium rounded-md px-1.5 py-0.5 ${cp.done === cp.total ? "bg-[#CAF0D9]" : "bg-card-alt text-muted"}`}>
                    <ListChecks size={12} strokeWidth={1.75} /> {cp.done}/{cp.total}
                  </span>
                )}
                <span className="text-[12px] font-medium px-2.5 py-0.5 rounded-full" style={{ backgroundColor: priorityMeta[t.priority].bg, color: priorityMeta[t.priority].text }}>
                  {t.priority}
                </span>
                <span className="text-[12.5px] text-muted w-[96px] text-right">{t.dueDate ? fmtDate(t.dueDate) : "No due date"}</span>
              </button>
            );
          })
        )}
      </div>

      {fromTemplate && (
        <FromTemplateDialog
          matter={matter}
          clientName={clientName}
          keyDates={keyDates}
          templates={templates}
          initial={fromTemplate === "pick" ? null : fromTemplate}
          boards={boards}
          onClose={() => setFromTemplate(null)}
          onCreate={(t) => {
            created(t);
            setFromTemplate(null);
          }}
        />
      )}

      {newTaskOpen && (
        <NewTaskModal
          defaultStatus="todo"
          onClose={() => setNewTaskOpen(false)}
          onCreate={(t) => {
            created({ ...t, matterId: matter.id, boardId: t.boardId ?? boardForMatter(boards, matter) });
            setNewTaskOpen(false);
          }}
        />
      )}

      {openTask && <TaskDetailModal task={openTask} onClose={() => setOpenTaskId(null)} onUpdate={updateTask} />}
    </div>
  );
}

function FromTemplateDialog({
  matter,
  clientName,
  keyDates,
  templates,
  initial,
  boards,
  onClose,
  onCreate,
}: {
  matter: Matter;
  clientName: string | null;
  keyDates: Record<string, string>;
  templates: TaskTemplate[] | null;
  initial: TaskTemplate | null;
  boards: { id: string; name: string }[];
  onClose: () => void;
  onCreate: (t: BoardTask) => void;
}) {
  const { suggested, others } = templatesFor(templates ?? [], matter.matterCode);
  const defaultTitle = (t: TaskTemplate | null) => (t ? `${t.name}: ${clientName ?? matter.title}` : "");
  // "" = the first suggested template (templates may still be loading when this opens).
  const [templateId, setTemplateId] = useState<string>(initial?.id ?? "");
  const chosenId = templateId || suggested[0]?.id || "";
  const template = (templates ?? []).find((t) => t.id === chosenId) ?? null;
  // null = keep the automatic title (follows the template).
  const [typedTitle, setTypedTitle] = useState<string | null>(null);
  const title = typedTitle ?? defaultTitle(template);
  // The matter type's board (REP, RES …) when there is one.
  const [boardId, setBoardId] = useState<string>(() => boardForMatter(boards, matter) ?? "");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");
  // Starts with the dates read from the matter's documents.
  const [dates, setDates] = useState<Record<string, string>>(keyDates);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  const anchors = template ? anchorsOf(applyTemplate(null, template)) : [];

  function submit() {
    if (!template || !title.trim()) return;
    const filled = Object.fromEntries(Object.entries(dates).filter(([k, v]) => v && anchors.includes(k)));
    const base = applyTemplate(null, template);
    const checklist = Object.keys(filled).length ? { ...base, dates: filled } : base;
    onCreate({
      id: crypto.randomUUID(),
      title: title.trim(),
      description: matter.matterNumber ? `Matter ${matter.matterNumber} · ${matter.title}` : `Matter: ${matter.title}`,
      status: "todo",
      priority,
      assignee,
      dueDate: dueDate || nextStep(checklist)?.due || null,
      comments: [],
      boardId: boardId || null,
      matterId: matter.id,
      checklist,
      createdAt: new Date().toISOString(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Create task from template"
        className="bg-cream rounded-3xl w-full max-w-[620px] max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-7 pt-6 pb-2">
          <div className="text-[13.5px] text-muted font-medium">
            {matter.matterNumber ?? matter.title} › <span className="text-ink font-semibold">Task from template</span>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-7 pt-3 pb-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-muted">Template</span>
            {templates === null ? (
              <span className="text-[13px] text-muted flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Loading templates…
              </span>
            ) : (
              <select
                value={chosenId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="bg-white border border-line rounded-xl px-3 py-2.5 text-[14px] outline-none"
              >
                <option value="" disabled>
                  Choose a template
                </option>
                {suggested.length > 0 && (
                  <optgroup label={`For ${matter.matterCode}`}>
                    {suggested.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label={suggested.length ? "Other templates" : "Templates"}>
                  {others.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            )}
            {template && (
              <span className="text-[12.5px] text-muted">
                {template.sections.length} sections · {itemCount(template)} steps go into the task&apos;s checklist.
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-muted">Task title</span>
            <input
              value={title}
              onChange={(e) => setTypedTitle(e.target.value)}
              maxLength={200}
              className="bg-white border border-line rounded-xl px-3 py-2.5 text-[14px] outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-muted">Put it on</span>
            <select value={boardId} onChange={(e) => setBoardId(e.target.value)} className="bg-white border border-line rounded-xl px-3 py-2.5 text-[14px] outline-none">
              <option value="">Main Task Board</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <GenericDropdown
              open={priorityOpen}
              setOpen={setPriorityOpen}
              trigger={
                <>
                  <Flag size={13} strokeWidth={1.75} /> {priority}
                </>
              }
            >
              {(["High", "Medium", "Low"] as TaskPriority[]).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setPriority(p);
                    setPriorityOpen(false);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip transition-colors"
                >
                  {p}
                </button>
              ))}
            </GenericDropdown>
            <GenericDropdown
              open={assigneeOpen}
              setOpen={setAssigneeOpen}
              trigger={
                <>
                  <User size={13} strokeWidth={1.75} /> {assignee ?? "Assignee"}
                </>
              }
            >
              <AssigneeOptions
                value={assignee}
                onPick={(email) => {
                  setAssignee(email);
                  setAssigneeOpen(false);
                }}
              />
            </GenericDropdown>
            <span className="flex items-center gap-1.5 bg-chip rounded-full pl-3 pr-1.5 py-1 text-[13px] font-medium">
              <CalendarDays size={13} strokeWidth={1.75} /> Due
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                aria-label="Task due date"
                className="bg-white/70 rounded-full px-2 py-0.5 text-[12.5px] outline-none"
              />
            </span>
          </div>

          {anchors.length > 0 && (
            <div className="rounded-2xl bg-card-alt p-4">
              <div className="text-[13px] font-semibold flex items-center gap-1.5">
                <LayoutList size={14} strokeWidth={1.75} /> Critical dates
              </div>
              <div className="text-[12.5px] text-muted mt-0.5 mb-3">Each step&apos;s due date is counted from these. Leave blank and fill in later in the task.</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                {anchors.map((a) => (
                  <label key={a} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate" title={a}>
                      {a}
                    </span>
                    <input
                      type="date"
                      value={dates[a] ?? ""}
                      onChange={(e) => setDates((d) => ({ ...d, [a]: e.target.value }))}
                      aria-label={a}
                      className="bg-white border border-line rounded-lg px-2 py-1 text-[12.5px] outline-none"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-7 py-5 border-t border-line">
          <button onClick={onClose} className="px-4 py-2.5 rounded-full text-[14px] font-medium hover:bg-chip transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!template || !title.trim()}
            className="bg-btn text-ink px-5 py-2.5 rounded-full text-[14px] font-medium hover:bg-btn-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Create task
          </button>
        </div>
      </div>
    </div>
  );
}

// "Next: Mortgage Commitment Received · Nov 9" — red when overdue.
export function NextStepLine({ task }: { task: BoardTask }) {
  const n = nextStep(task.checklist);
  if (!n) return null;
  const color = n.state === "overdue" ? "text-[#B4232C]" : n.state === "today" || n.state === "soon" ? "text-[#8A4B14]" : "text-muted";
  return (
    <span className={`block text-[12px] truncate ${color}`} title={n.text}>
      {n.state === "overdue" ? "Overdue: " : "Next: "}
      {n.text} · {fmtDate(n.due)}
    </span>
  );
}
