"use client";

import { useState } from "react";
import {
  Kanban,
  List,
  Search,
  SlidersHorizontal,
  Filter,
  Plus,
  MoreHorizontal,
  Pencil,
  Palette,
  Trash2,
  ClipboardList,
  ChevronDown,
} from "lucide-react";
import NewTaskModal, { BoardTask, TaskStatus, statusMeta } from "@/components/NewTaskModal";
import ColorPicker from "@/components/ColorPicker";

type Column = {
  id: string;
  title: string;
  color: string;
  status: TaskStatus;
};

const initialColumns: Column[] = [
  { id: "todo", title: "To do", color: "#A5A6F6", status: "todo" },
  { id: "inprogress", title: "In progress", color: "#3B82F6", status: "inprogress" },
  { id: "waiting", title: "Waiting", color: "#F59E0B", status: "waiting" },
  { id: "done", title: "Done", color: "#22C55E", status: "done" },
];

const filterPills = ["Me", "Overdue", "Due this week", "Waiting on client"];

export default function TaskBoardPage() {
  const [view, setView] = useState<"board" | "list">("board");
  const [columns, setColumns] = useState<Column[]>(initialColumns);
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [inlineAddFor, setInlineAddFor] = useState<string | null>(null);
  const [inlineValue, setInlineValue] = useState("");

  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");

  const [modalStatus, setModalStatus] = useState<TaskStatus | null>(null);

  function toggleFilter(f: string) {
    setActiveFilters((fs) => (fs.includes(f) ? fs.filter((x) => x !== f) : [...fs, f]));
  }

  function renameColumn(id: string) {
    setColumns((cols) => cols.map((c) => (c.id === id ? { ...c, title: renameValue || c.title } : c)));
    setRenamingId(null);
  }

  function recolorColumn(id: string, color: string) {
    setColumns((cols) => cols.map((c) => (c.id === id ? { ...c, color } : c)));
    setColorPickerFor(null);
  }

  function deleteColumn(id: string) {
    setColumns((cols) => cols.filter((c) => c.id !== id));
    setMenuOpenFor(null);
  }

  function addInlineTask(status: TaskStatus) {
    if (!inlineValue.trim()) {
      setInlineAddFor(null);
      return;
    }
    setTasks((ts) => [
      ...ts,
      {
        id: crypto.randomUUID(),
        title: inlineValue,
        description: "",
        status,
        priority: "Medium",
        assignee: null,
        dueDate: null,
      },
    ]);
    setInlineValue("");
    setInlineAddFor(null);
  }

  function addColumn() {
    if (!newColumnName.trim()) {
      setAddingColumn(false);
      return;
    }
    setColumns((cols) => [
      ...cols,
      {
        id: crypto.randomUUID(),
        title: newColumnName,
        color: "#6B7280",
        status: "todo",
      },
    ]);
    setNewColumnName("");
    setAddingColumn(false);
  }

  return (
    <div className="px-10 py-10">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center bg-card-alt rounded-full p-1">
          <button
            onClick={() => setView("board")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13.5px] font-medium transition-colors ${
              view === "board" ? "bg-white shadow-sm" : "text-muted"
            }`}
          >
            <Kanban size={14} strokeWidth={1.75} /> Board
          </button>
          <button
            onClick={() => setView("list")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13.5px] font-medium transition-colors ${
              view === "list" ? "bg-white shadow-sm" : "text-muted"
            }`}
          >
            <List size={14} strokeWidth={1.75} /> List
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button className="w-9 h-9 rounded-full bg-card-alt hover:bg-line/60 transition-colors flex items-center justify-center">
            <Search size={15} strokeWidth={1.75} />
          </button>
          <button className="w-9 h-9 rounded-full bg-card-alt hover:bg-line/60 transition-colors flex items-center justify-center">
            <Filter size={15} strokeWidth={1.75} />
          </button>
          <button className="w-9 h-9 rounded-full bg-card-alt hover:bg-line/60 transition-colors flex items-center justify-center">
            <SlidersHorizontal size={15} strokeWidth={1.75} />
          </button>
          <button
            onClick={() => setModalStatus("todo")}
            className="bg-dark text-white px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 hover:bg-dark2 transition-colors"
          >
            <Plus size={14} strokeWidth={2} /> Add task
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <div className="w-7 h-7 rounded-full bg-card-alt flex items-center justify-center text-muted text-[12px] font-medium">
          ?
        </div>
        {filterPills.map((f) => (
          <button
            key={f}
            onClick={() => toggleFilter(f)}
            className={`px-3.5 py-1.5 rounded-full text-[13.5px] font-medium transition-colors ${
              activeFilters.includes(f) ? "bg-dark text-white" : "bg-card-alt text-muted hover:text-ink"
            }`}
          >
            {f}
          </button>
        ))}
        <button className="flex items-center gap-1.5 bg-card-alt px-3.5 py-1.5 rounded-full text-[13.5px] font-medium text-muted">
          Matter <ChevronDown size={12} strokeWidth={1.75} />
        </button>
      </div>

      {view === "list" ? (
        <div className="border border-line rounded-2xl min-h-[420px] flex flex-col items-center justify-center text-center">
          {tasks.length === 0 ? (
            <>
              <ClipboardList size={26} strokeWidth={1.5} className="text-muted mb-4" />
              <div className="text-[16px] font-semibold mb-4">No tasks yet</div>
              <button
                onClick={() => setModalStatus("todo")}
                className="bg-dark text-white px-4 py-2.5 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 hover:bg-dark2 transition-colors"
              >
                <Plus size={14} strokeWidth={2} /> Add task
              </button>
            </>
          ) : (
            <div className="w-full divide-y divide-line">
              {tasks.map((t) => {
                const Icon = statusMeta[t.status].icon;
                return (
                  <div key={t.id} className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-3">
                      <Icon size={15} strokeWidth={2} className={statusMeta[t.status].color} />
                      <span className="text-[14.5px] font-medium">{t.title}</span>
                    </div>
                    <span className="text-[12.5px] text-muted">{t.priority}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.status);
            return (
              <div key={col.id} className="w-[260px] flex-shrink-0">
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: col.color }}
                    />
                    {renamingId === col.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => renameColumn(col.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameColumn(col.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="text-[14px] font-semibold bg-white border border-line rounded-md px-1.5 py-0.5 outline-none w-[110px]"
                      />
                    ) : (
                      <span className="text-[14px] font-semibold">{col.title}</span>
                    )}
                    <span className="text-[12px] text-muted bg-card-alt rounded-full px-1.5">
                      {colTasks.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 relative">
                    <button
                      onClick={() => {
                        setInlineAddFor(col.id);
                        setInlineValue("");
                      }}
                      className="w-6 h-6 rounded-full hover:bg-card-alt flex items-center justify-center text-muted hover:text-ink transition-colors"
                    >
                      <Plus size={14} strokeWidth={1.75} />
                    </button>
                    <button
                      onClick={() => setMenuOpenFor(menuOpenFor === col.id ? null : col.id)}
                      className="w-6 h-6 rounded-full hover:bg-card-alt flex items-center justify-center text-muted hover:text-ink transition-colors"
                    >
                      <MoreHorizontal size={14} strokeWidth={1.75} />
                    </button>

                    {menuOpenFor === col.id && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setMenuOpenFor(null)} />
                        <div className="absolute right-0 top-[calc(100%+4px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 w-[170px]">
                          <button
                            onClick={() => {
                              setRenamingId(col.id);
                              setRenameValue(col.title);
                              setMenuOpenFor(null);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors"
                          >
                            <Pencil size={14} strokeWidth={1.75} /> Rename
                          </button>
                          <button
                            onClick={() => {
                              setColorPickerFor(col.id);
                              setMenuOpenFor(null);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors"
                          >
                            <Palette size={14} strokeWidth={1.75} /> Recolor
                          </button>
                          <div className="border-t border-line my-1" />
                          <button
                            onClick={() => deleteColumn(col.id)}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={14} strokeWidth={1.75} /> Delete column
                          </button>
                        </div>
                      </>
                    )}

                    {colorPickerFor === col.id && (
                      <div className="absolute right-0 top-[calc(100%+4px)] z-50">
                        <ColorPicker
                          value={col.color}
                          onChange={(c) => recolorColumn(col.id, c)}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-card-alt rounded-2xl p-2 min-h-[420px] flex flex-col gap-2">
                  {colTasks.map((t) => {
                    const Icon = statusMeta[t.status].icon;
                    return (
                      <div
                        key={t.id}
                        className="bg-white border border-line rounded-xl px-3.5 py-3"
                      >
                        <div className="text-[13.5px] font-medium mb-1.5">{t.title}</div>
                        <div className="flex items-center gap-2 text-[11.5px] text-muted">
                          <Icon size={12} strokeWidth={2} className={statusMeta[t.status].color} />
                          {t.priority}
                          {t.dueDate && <span>· {t.dueDate}</span>}
                        </div>
                      </div>
                    );
                  })}

                  {inlineAddFor === col.id ? (
                    <input
                      autoFocus
                      value={inlineValue}
                      onChange={(e) => setInlineValue(e.target.value)}
                      onBlur={() => addInlineTask(col.status)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addInlineTask(col.status);
                        if (e.key === "Escape") setInlineAddFor(null);
                      }}
                      placeholder="Task title (Enter to add, Esc to cancel)"
                      className="w-full bg-white border border-line rounded-xl px-3.5 py-3 text-[13.5px] outline-none placeholder:text-muted"
                    />
                  ) : (
                    <button
                      onClick={() => {
                        setInlineAddFor(col.id);
                        setInlineValue("");
                      }}
                      className="flex flex-col items-center justify-center gap-1.5 py-6 text-muted hover:text-ink transition-colors"
                    >
                      <Plus size={16} strokeWidth={1.75} />
                      <span className="text-[13px]">Add a task</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          <div className="w-[60px] flex-shrink-0 flex flex-col items-center pt-1">
            {addingColumn ? (
              <input
                autoFocus
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                onBlur={addColumn}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addColumn();
                  if (e.key === "Escape") setAddingColumn(false);
                }}
                placeholder="Column name"
                className="w-[180px] bg-white border border-line rounded-xl px-3 py-2 text-[13px] outline-none"
              />
            ) : (
              <button
                onClick={() => setAddingColumn(true)}
                className="w-9 h-9 rounded-full bg-card-alt hover:bg-line/60 transition-colors flex items-center justify-center text-muted hover:text-ink"
              >
                <Plus size={16} strokeWidth={1.75} />
              </button>
            )}
          </div>
        </div>
      )}

      {modalStatus && (
        <NewTaskModal
          defaultStatus={modalStatus}
          onClose={() => setModalStatus(null)}
          onCreate={(task) => {
            setTasks((ts) => [...ts, task]);
            setModalStatus(null);
          }}
        />
      )}
    </div>
  );
}
