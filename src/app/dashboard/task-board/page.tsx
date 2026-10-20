"use client";

import TemplatesModal from "@/components/templates/TemplatesModal";
import PriorityDot from "@/components/PriorityDot";
import { progress as checklistProgress, alerts as checklistAlerts } from "@/lib/checklist";
import { Fragment, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  User,
  X,
  ChevronLeft,
  ChevronRight,
  Columns3,
  ChevronsRightLeft,
  Check,
  ListChecks,
} from "lucide-react";
import NewTaskModal, {
  BoardTask,
  TaskStatus,
  statusMeta,
  todayYmd,
} from "@/components/NewTaskModal";
import TaskDetailModal from "@/components/TaskDetailModal";
import { NextStepLine } from "@/components/matters/MatterTasks";
import { filterLabel, filterTest, waitingLabel, type CustomFilter } from "@/lib/tasks/customFilters";
import AddFilterMenu from "@/components/tasks/AddFilterMenu";
import ColorPicker from "@/components/ColorPicker";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import MemberAvatar from "@/components/MemberAvatar";
import {
  FilterMenu,
  DisplayMenu,
  NO_FILTERS,
  DEFAULT_DISPLAY,
  countFilters,
  matchesFilters,
  matchesSearch,
  sortTasks,
  manualKey,
  type AdvancedFilters,
  type DisplayOptions,
} from "@/components/TaskBoardControls";

const DISPLAY_KEY = "lawpower.taskboard.display";

// Columns are 227-240px wide (10% wider than the Oct 20 trim): a sixth of the
// board each, but never under 227px on small laptops or over 240px on big monitors.
// Card titles are 12px semibold. A 13" laptop shows about 4 columns, a large monitor 8-9.
// More columns sit off to the right; the board scrolls sideways.
const VISIBLE_COLUMNS = 6;
const COLUMN_MIN = 227;
const COLUMN_MAX = 240;
const COLUMN_GAP = 14;
const COLUMN_WIDTH = `clamp(${COLUMN_MIN}px, calc((100% - ${(VISIBLE_COLUMNS - 1) * COLUMN_GAP}px) / ${VISIBLE_COLUMNS}), ${COLUMN_MAX}px)`;

// Collapsed columns are remembered per board in this browser.
const collapsedKey = (board: string) => `lawpower.taskboard.collapsed.${board}`;
function readCollapsed(board: string): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(collapsedKey(board)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function writeCollapsed(board: string, ids: Set<string>) {
  try {
    window.localStorage.setItem(collapsedKey(board), JSON.stringify([...ids]));
  } catch {
    // private mode: just not remembered
  }
}
function readDisplay(): DisplayOptions {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(DISPLAY_KEY);
    return raw ? { ...DEFAULT_DISPLAY, ...JSON.parse(raw) } : DEFAULT_DISPLAY;
  } catch {
    return DEFAULT_DISPLAY;
  }
}
import { displayName } from "@/lib/initials";
import Link from "next/link";
import { isDueIn, isOverdue } from "@/lib/taskDates";

type Column = {
  id: string; // status for standard columns, database id for custom ones
  title: string;
  color: string;
  status: TaskStatus; // custom columns hold tasks with status "todo" unless moved
  custom?: boolean;
};

type ColumnRow = { id: string; status: TaskStatus | null; title: string; color: string; position: number };

const initialColumns: Column[] = [
  { id: "todo", title: "To do", color: "#A5A6F6", status: "todo" },
  { id: "inprogress", title: "In progress", color: "#3B82F6", status: "inprogress" },
  { id: "waiting", title: "Waiting", color: "#F59E0B", status: "waiting" },
  { id: "done", title: "Done", color: "#22C55E", status: "done" },
];

// The fixed quick filters; each board adds its own with "+ Add more" (Waiting on …, priority, …).
const filterPills = ["Me", "Overdue", "Due today", "Due this week", "Next week", "Due this month"];

// Pills that actually narrow the task list. A task is shown if it matches
// any active one. "Me" (tasks assigned to the signed-in person) is added in TaskBoard.
const filterTests: Record<string, (t: BoardTask) => boolean> = {
  Overdue: isOverdue,
  "Due today": (t) => isDueIn(t, "today"),
  "Due this week": (t) => isDueIn(t, "week"),
  "Next week": (t) => isDueIn(t, "nextweek"),
  "Due this month": (t) => isDueIn(t, "month"),
};

const dueParamToPill: Record<string, string> = {
  today: "Due today",
  week: "Due this week",
  nextweek: "Next week",
  month: "Due this month",
};

export default function TaskBoardPage() {
  return (
    <Suspense fallback={null}>
      <TaskBoardFromUrl />
    </Suspense>
  );
}

// Reads ?due=today|week|nextweek|month (used by the Dashboard's "Due today" card)
// and opens the board with that filter already on.
function TaskBoardFromUrl() {
  const params = useSearchParams();
  const due = params.get("due") ?? "";
  const pill = dueParamToPill[due];
  const board = params.get("board");
  const by = params.get("by");
  return (
    <TaskBoard
      key={`${board ?? "main"}:${by ?? ""}:${due}`}
      boardId={by ? null : board === "general" ? "general" : board}
      createdBy={by}
      initialFilters={pill ? [pill] : []}
      initialTaskId={params.get("task")}
    />
  );
}

function TaskBoard({
  boardId,
  createdBy,
  initialFilters,
  initialTaskId,
}: {
  boardId: string | null; // null = all tasks; "general" = tasks not on any board; else a board id
  createdBy: string | null; // show every task this person created, on any board
  initialFilters: string[];
  initialTaskId: string | null;
}) {
  const router = useRouter();
  const { boards, createBoard, renameBoard, deleteBoard, refreshAll, generalName, renameGeneral, moveGeneralTasks } = useWorkspaceData();
  // Removing General: its tasks move to the board picked here.
  const [moveGeneral, setMoveGeneral] = useState<{ to: string; busy: boolean; error: string | null } | null>(null);
  const isGeneral = boardId === "general";
  const realBoardId = boardId && !isGeneral ? boardId : null;
  const board = realBoardId ? boards.find((b) => b.id === realBoardId) ?? null : null;
  const [boardMenu, setBoardMenu] = useState(false);
  const [boardDialog, setBoardDialog] = useState<null | { mode: "new" | "rename"; name: string }>(null);
  const [boardBusy, setBoardBusy] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "list">("board");
  const [columns, setColumns] = useState<Column[]>(initialColumns);

  // ── Horizontal board: scrolling, arrows, jump menu, collapsed columns ──
  const layoutKey = createdBy ? `by:${createdBy}` : boardId ?? "all";
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set() : readCollapsed(layoutKey)
  );
  const scrollerRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef(new Map<string, HTMLElement>());
  const [edges, setEdges] = useState({ left: false, right: false });
  const [onScreen, setOnScreen] = useState<Set<string>>(new Set());
  const [boardHeight, setBoardHeight] = useState<number | null>(null);
  const [jumpOpen, setJumpOpen] = useState(false);

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    const box = el.getBoundingClientRect();
    setBoardHeight(Math.max(420, window.innerHeight - box.top - window.scrollY - 20));
    const visible = new Set<string>();
    colRefs.current.forEach((node, id) => {
      const r = node.getBoundingClientRect();
      const shown = Math.min(r.right, box.right) - Math.max(r.left, box.left);
      if (shown >= Math.min(r.width, box.width) * 0.6) visible.add(id);
    });
    setOnScreen((prev) => (prev.size === visible.size && [...visible].every((v) => prev.has(v)) ? prev : visible));
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    colRefs.current.forEach((node) => ro.observe(node));
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, view, columns.length, collapsed]);

  function toggleCollapsed(id: string, value?: boolean) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      const collapse = value ?? !next.has(id);
      if (collapse) next.add(id);
      else next.delete(id);
      writeCollapsed(layoutKey, next);
      return next;
    });
  }

  function scrollByColumn(dir: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    // One column at a time, whatever width the columns have on this screen.
    const full = Array.from(el.children).find((c) => (c as HTMLElement).offsetWidth >= COLUMN_MIN - 1) as HTMLElement | undefined;
    const step = (full?.offsetWidth || COLUMN_MIN) + COLUMN_GAP;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  }

  function jumpTo(id: string) {
    setJumpOpen(false);
    if (collapsed.has(id)) toggleCollapsed(id, false);
    // After an expand, wait a frame so the column has its full width.
    requestAnimationFrame(() => {
      const el = scrollerRef.current;
      const node = colRefs.current.get(id);
      if (!el || !node) return;
      const left = node.offsetLeft; // the scroller is the columns' offset parent
      const fits = left >= el.scrollLeft && left + node.offsetWidth <= el.scrollLeft + el.clientWidth;
      if (!fits) el.scrollTo({ left, behavior: "smooth" });
      node.animate?.([{ boxShadow: "0 0 0 3px rgba(18,17,16,0.25)" }, { boxShadow: "0 0 0 0 rgba(18,17,16,0)" }], { duration: 900 });
    });
  }
  // Saved columns belong to a board ("general" or its id). "All tasks" and
  // "created by" views show the standard columns only.
  const boardKey: string | null = createdBy || boardId === null ? null : boardId === "general" ? "general" : boardId;

  // A board always opens at its first column (not where the previous board was scrolled to).
  // The jump is instant (no smooth slide that later loading could stop half-way), with
  // snapping off for that moment, and repeated while the board finishes loading,
  // unless the person has started scrolling it themselves.
  const resetUntil = useRef(0);
  const toStart = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || Date.now() > resetUntil.current || el.scrollLeft === 0) return;
    const snap = el.style.scrollSnapType;
    el.style.scrollSnapType = "none";
    el.scrollTo({ left: 0, behavior: "instant" as ScrollBehavior });
    requestAnimationFrame(() => {
      el.scrollTo({ left: 0, behavior: "instant" as ScrollBehavior });
      el.style.scrollSnapType = snap;
    });
  }, []);
  useEffect(() => {
    resetUntil.current = Date.now() + 2500;
    const el = scrollerRef.current;
    const stop = () => (resetUntil.current = 0); // the person scrolled: leave it
    el?.addEventListener("wheel", stop, { passive: true });
    el?.addEventListener("pointerdown", stop);
    el?.addEventListener("keydown", stop);
    toStart();
    const timers = [100, 400, 1000, 2000].map((ms) => setTimeout(toStart, ms));
    return () => {
      timers.forEach(clearTimeout);
      el?.removeEventListener("wheel", stop);
      el?.removeEventListener("pointerdown", stop);
      el?.removeEventListener("keydown", stop);
    };
  }, [boardKey, createdBy, toStart]);
  useEffect(() => {
    toStart();
  }, [columns, toStart]);
  const { tasks: workspaceTasks, tasksLoaded, tasksError, clearTasksError, addTask: addWorkspaceTask, updateTask, deleteTasks } =
    useWorkspaceData();
  // Only this board's tasks; new tasks land on this board.
  const { teamMembers, matters } = useWorkspaceData();
  const creator = createdBy ? teamMembers.find((m) => m.id === createdBy) ?? null : null;
  const allTasks = createdBy
    ? workspaceTasks.filter((t) => t.createdBy === createdBy)
    : boardId === null
      ? workspaceTasks // all boards
      : workspaceTasks.filter((t) => (t.boardId ?? null) === realBoardId);
  // New tasks land on the board being viewed; from "All tasks" or "General" they go to General.
  const addTask = (t: BoardTask) => addWorkspaceTask({ ...t, boardId: realBoardId });

  async function saveBoard() {
    if (!boardDialog) return;
    setBoardBusy(true);
    setBoardError(null);
    try {
      if (boardDialog.mode === "new") {
        const b = await createBoard(boardDialog.name);
        setBoardDialog(null);
        router.push(`/dashboard/task-board?board=${b.id}`);
      } else if (isGeneral) {
        await renameGeneral(boardDialog.name);
        setBoardDialog(null);
      } else if (realBoardId) {
        await renameBoard(realBoardId, boardDialog.name);
        setBoardDialog(null);
      }
    } catch (e) {
      setBoardError((e as Error).message);
    } finally {
      setBoardBusy(false);
    }
  }

  async function removeBoard() {
    if (!realBoardId || !board) return;
    const n = allTasks.length;
    if (!confirm(`Delete the "${board.name}" board?${n ? ` Its ${n} ${n === 1 ? "task moves" : "tasks move"} to ${generalName}.` : ""}`)) return;
    try {
      await deleteBoard(realBoardId);
      router.push("/dashboard/task-board");
    } catch (e) {
      setBoardError((e as Error).message);
    }
  }
  const [cardMenuFor, setCardMenuFor] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<string[]>(initialFilters);
  const { meEmail, boardFilters, saveBoardFilters, teamMembers: members } = useWorkspaceData();
  // This board's own quick filters ("+ Add more"); keys "cf:<id>" in activeFilters.
  const filterBoard = boardKey ?? "all";
  const customFilters = boardFilters[filterBoard] ?? [];
  const nameOf = (email: string) => members.find((m) => m.email.toLowerCase() === email.toLowerCase())?.fullName || email;
  const customLabel = (key: string) => {
    const f = customFilters.find((c) => `cf:${c.id}` === key);
    return f ? filterLabel(f, nameOf) : key;
  };
  const tests: Record<string, (t: BoardTask) => boolean> = {
    ...filterTests,
    Me: (t) =>
      !!meEmail &&
      ((t.assignee ?? "").toLowerCase() === meEmail.toLowerCase() ||
        (!t.assignee && (t.offeredTo ?? []).some((e) => e.toLowerCase() === meEmail.toLowerCase()))),
    ...Object.fromEntries(customFilters.map((f) => [`cf:${f.id}`, filterTest(f)])),
  };
  const [addFilterOpen, setAddFilterOpen] = useState(false);
  const [filterError, setFilterError] = useState<string | null>(null);
  async function addCustomFilter(f: Omit<CustomFilter, "id">) {
    setFilterError(null);
    try {
      await saveBoardFilters(filterBoard, [...customFilters, { id: Math.random().toString(36).slice(2, 10), ...f }]);
      setAddFilterOpen(false);
    } catch (e) {
      setFilterError((e as Error).message);
    }
  }
  async function removeCustomFilter(id: string) {
    setActiveFilters((fs) => fs.filter((x) => x !== `cf:${id}`));
    try {
      await saveBoardFilters(filterBoard, customFilters.filter((c) => c.id !== id));
    } catch (e) {
      setFilterError((e as Error).message);
    }
  }
  const activeTests = activeFilters.map((f) => tests[f]).filter(Boolean);

  // Search, the filter menu and display options (toolbar icons).
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [adv, setAdv] = useState<AdvancedFilters>(NO_FILTERS);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [display, setDisplayState] = useState<DisplayOptions>(readDisplay);
  const setDisplay = (d: DisplayOptions) => {
    setDisplayState(d);
    try {
      window.localStorage.setItem(DISPLAY_KEY, JSON.stringify(d));
    } catch {
      // not persisted
    }
  };
  const advCount = countFilters(adv);
  // Matter filter: only tasks linked to one matter.
  const [matterFilter, setMatterFilter] = useState<string | null>(null);
  const [matterMenuOpen, setMatterMenuOpen] = useState(false);
  const filterMatter = matterFilter ? matters.find((m) => m.id === matterFilter) ?? null : null;
  // Matters that have tasks here first, newest number first.
  const matterIdsHere = new Set(allTasks.map((t) => t.matterId).filter(Boolean));
  const matterOptions = [...matters].sort(
    (a, b) => Number(matterIdsHere.has(b.id)) - Number(matterIdsHere.has(a.id)) || (b.matterSeq ?? 0) - (a.matterSeq ?? 0) || a.title.localeCompare(b.title)
  );

  const tasks = sortTasks(
    allTasks
      .filter((t) => !matterFilter || t.matterId === matterFilter)
      .filter((t) => activeTests.length === 0 || activeTests.some((test) => test(t)))
      .filter((t) => matchesSearch(t, query))
      .filter((t) => matchesFilters(t, adv)),
    display.sort
  );
  const narrowing = activeTests.length > 0 || !!query.trim() || advCount > 0 || !!matterFilter;

  const shownColumns = columns.filter((c) => !(display.hideDone && !c.custom && c.status === "done"));
  const customIds = new Set(columns.filter((c) => c.custom).map((c) => c.id));
  const tasksFor = (col: Column) =>
    col.custom
      ? tasks.filter((t) => t.columnId === col.id)
      : tasks.filter((t) => t.status === col.status && !(t.columnId && customIds.has(t.columnId)));

  // Drag and drop: drag a task card to another column, or up/down within a column
  // to arrange it (saved as the card's position, shown in "My order").
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<string | null>(null);
  const [dropBefore, setDropBefore] = useState<string | null>(null); // card to drop above; null = bottom
  const endDrag = () => {
    setDragId(null);
    setDropCol(null);
    setDropBefore(null);
  };
  const dropProps = (col: Column) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dropCol !== col.id) setDropCol(col.id);
      // Over empty space (not a card): drop at the bottom.
      if (!(e.target as Element).closest?.("[data-task-card]") && dropBefore !== null) setDropBefore(null);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropCol((c) => (c === col.id ? null : c));
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = dragId ?? e.dataTransfer.getData("text/plain");
      const before = dropBefore;
      endDrag();
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      const columnId = col.custom ? col.id : null;
      // Neighbours in the column's own (manual) order, without the dragged card.
      const list = sortTasks(tasksFor(col), "manual").filter((x) => x.id !== t.id);
      const at = before ? list.findIndex((x) => x.id === before) : list.length;
      const idx = at < 0 ? list.length : at;
      const prev = list[idx - 1];
      const next = list[idx];
      const sameColumn = t.status === col.status && (t.columnId ?? null) === columnId;
      if (sameColumn) {
        const current = sortTasks(tasksFor(col), "manual");
        const oldIdx = current.findIndex((x) => x.id === t.id);
        if (oldIdx === idx) return; // dropped where it already was
      }
      const position =
        prev && next
          ? (manualKey(prev) + manualKey(next)) / 2
          : prev
            ? manualKey(prev) + 1000
            : next
              ? manualKey(next) - 1000
              : (t.position ?? null);
      updateTask({ ...t, status: col.status, columnId, position });
      // Show the arrangement: switch the board to "My order" if it was sorted another way.
      if (display.sort !== "manual") setDisplay({ ...display, sort: "manual" });
    },
  });

  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [inlineAddFor, setInlineAddFor] = useState<string | null>(null);
  const [inlineValue, setInlineValue] = useState("");

  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");

  const [modalStatus, setModalStatus] = useState<TaskStatus | null>(null);
  const [selectedTask, setSelectedTask] = useState<BoardTask | null>(null);
  const [linkDismissed, setLinkDismissed] = useState(false);
  const linkedTask = !linkDismissed && initialTaskId ? allTasks.find((t) => t.id === initialTaskId) ?? null : null;
  const openTask = selectedTask ?? linkedTask;

  function toggleFilter(f: string) {
    setActiveFilters((fs) => (fs.includes(f) ? fs.filter((x) => x !== f) : [...fs, f]));
  }

  async function columnApi(url: string, method: string, body?: unknown) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d?.error ?? "Couldn't save the column.");
    return d;
  }

  async function saveColumnLook(col: Column, patch: { title?: string; color?: string }) {
    const before = columns;
    setColumns((cols) => cols.map((c) => (c.id === col.id ? { ...c, ...patch } : c)));
    if (!boardKey) return; // "All tasks" view: not saved
    try {
      if (col.custom) await columnApi(`/api/board-columns/${col.id}`, "PATCH", patch);
      else await columnApi("/api/board-columns", "POST", { board: boardKey, status: col.status, title: patch.title ?? col.title, color: patch.color ?? col.color });
    } catch (e) {
      setColumns(before);
      setBoardError((e as Error).message);
    }
  }

  function renameColumn(id: string) {
    const col = columns.find((c) => c.id === id);
    setRenamingId(null);
    if (col && renameValue.trim() && renameValue.trim() !== col.title) saveColumnLook(col, { title: renameValue.trim() });
  }

  function recolorColumn(id: string, color: string) {
    const col = columns.find((c) => c.id === id);
    setColorPickerFor(null);
    if (col) saveColumnLook(col, { color });
  }

  async function deleteColumn(id: string) {
    setMenuOpenFor(null);
    const col = columns.find((c) => c.id === id);
    if (!col?.custom) return;
    const n = tasks.filter((t) => t.columnId === id).length;
    if (!confirm(`Delete the "${col.title}" column?${n ? ` Its ${n} ${n === 1 ? "task moves" : "tasks move"} back to To do.` : ""}`)) return;
    const before = columns;
    setColumns((cols) => cols.filter((c) => c.id !== id));
    try {
      await columnApi(`/api/board-columns/${id}`, "DELETE");
      refreshAll(); // tasks from that column now sit in their status column
    } catch (e) {
      setColumns(before);
      setBoardError((e as Error).message);
    }
  }

  function addInlineTask(col: Column) {
    if (!inlineValue.trim()) {
      setInlineAddFor(null);
      return;
    }
    addTask({
      id: crypto.randomUUID(),
      title: inlineValue.trim(),
      description: "",
      status: col.status,
      columnId: col.custom ? col.id : null,
      priority: "Medium",
      assignee: null,
      dueDate: todayYmd(),
      comments: [],
    });
    setInlineValue("");
    setInlineAddFor(null);
  }

  async function addColumn() {
    const title = newColumnName.trim();
    setAddingColumn(false);
    setNewColumnName("");
    if (!title || !boardKey) return;
    try {
      const d = await columnApi("/api/board-columns", "POST", { board: boardKey, title, color: "#8C8784" });
      setColumns((cols) => [...cols, { id: d.column.id, title: d.column.title, color: d.column.color, status: "todo", custom: true }]);
    } catch (e) {
      setBoardError((e as Error).message);
    }
  }

  useEffect(() => {
    if (!boardKey) return;
    let cancelled = false;
    fetch(`/api/board-columns?board=${encodeURIComponent(boardKey)}`)
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d?.error ?? "Couldn't load this board's columns.");
        return (d.columns ?? []) as ColumnRow[];
      })
      .then((rows) => {
        if (cancelled) return;
        const standard = initialColumns.map((c) => {
          const o = rows.find((r) => r.status === c.status);
          return o ? { ...c, title: o.title, color: o.color } : c;
        });
        const custom = rows
          .filter((r) => !r.status)
          .sort((a, b) => a.position - b.position)
          .map((r) => ({ id: r.id, title: r.title, color: r.color, status: "todo" as TaskStatus, custom: true }));
        setColumns([...standard, ...custom]);
      })
      .catch((e: Error) => !cancelled && setBoardError(e.message));
    return () => {
      cancelled = true;
    };
  }, [boardKey]);

  return (
    <div className="px-10 py-10">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {createdBy && <MemberAvatar userId={createdBy} size={32} />}
          <h1 className="font-display text-[24px] font-semibold truncate">
            {createdBy
              ? `Tasks created by ${creator ? displayName(creator.fullName, creator.email) : "a former member"}`
              : isGeneral
                ? generalName
                : realBoardId
                  ? board?.name ?? "Board"
                  : "All tasks"}
          </h1>
          {createdBy && (
            <Link href="/dashboard/task-board" className="text-[13px] text-muted hover:text-ink underline underline-offset-2 ml-1 flex-shrink-0">
              Show all tasks
            </Link>
          )}
          {((realBoardId && board) || isGeneral) && (
            <div className="relative">
              <button
                onClick={() => setBoardMenu((o) => !o)}
                className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center text-muted hover:text-ink"
                aria-label="Board options"
              >
                <MoreHorizontal size={16} strokeWidth={1.75} />
              </button>
              {boardMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setBoardMenu(false)} />
                  <div className="absolute left-0 top-[calc(100%+4px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 w-[230px] whitespace-nowrap">
                    <button
                      onClick={() => {
                        setBoardMenu(false);
                        setBoardError(null);
                        setBoardDialog({ mode: "rename", name: isGeneral ? generalName : board?.name ?? "" });
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip"
                    >
                      <Pencil size={14} strokeWidth={1.75} /> Rename board
                    </button>
                    <button
                      onClick={() => {
                        setBoardMenu(false);
                        if (isGeneral) setMoveGeneral({ to: boards[0]?.id ?? "", busy: false, error: null });
                        else removeBoard();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium text-red-500 hover:bg-red-50"
                    >
                      <Trash2 size={14} strokeWidth={1.75} /> {isGeneral ? "Move tasks & remove" : "Delete board"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {realBoardId && !board && boards.length > 0 && (
          <span className="text-[13px] text-muted">This board no longer exists. Pick another board in the sidebar.</span>
        )}
      </div>

      {boardError && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">{boardError}</div>
      )}

      {moveGeneral && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => !moveGeneral.busy && setMoveGeneral(null)}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Remove ${generalName}`} className="bg-cream rounded-3xl w-full max-w-[440px] p-6">
            <h2 className="text-[19px] font-semibold mb-1">Remove {generalName}</h2>
            <p className="text-[13.5px] text-muted mb-4">
              {generalName} holds the tasks that aren&apos;t on another board, so it can&apos;t be deleted while it has tasks. Move its{" "}
              {allTasks.length} {allTasks.length === 1 ? "task" : "tasks"} to another board and it disappears from the sidebar. It only comes back if a task is
              ever saved without a board.
            </p>
            {boards.length === 0 ? (
              <div className="text-[13.5px] text-[#8A4B14] bg-[#FDF1E7] rounded-xl px-3.5 py-2.5">Create another board first (+ New board in the sidebar).</div>
            ) : (
              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-semibold text-muted">Move the tasks to</span>
                <select
                  value={moveGeneral.to}
                  onChange={(e) => setMoveGeneral({ ...moveGeneral, to: e.target.value })}
                  className="bg-white border border-line rounded-xl px-3 py-2.5 text-[14px] outline-none"
                >
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {moveGeneral.error && <div className="text-[13px] text-[#B42318] mt-3">{moveGeneral.error}</div>}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setMoveGeneral(null)} disabled={moveGeneral.busy} className="px-4 py-2.5 rounded-full text-[14px] font-medium hover:bg-chip">
                Cancel
              </button>
              <button
                disabled={moveGeneral.busy || !moveGeneral.to}
                onClick={async () => {
                  setMoveGeneral({ ...moveGeneral, busy: true, error: null });
                  try {
                    await moveGeneralTasks(moveGeneral.to);
                    const to = moveGeneral.to;
                    setMoveGeneral(null);
                    router.push(`/dashboard/task-board?board=${to}`);
                  } catch (e) {
                    setMoveGeneral({ ...moveGeneral, busy: false, error: (e as Error).message });
                  }
                }}
                className="bg-btn hover:bg-btn-hover disabled:opacity-50 px-5 py-2.5 rounded-full text-[14px] font-medium"
              >
                {moveGeneral.busy ? "Moving…" : "Move tasks & remove"}
              </button>
            </div>
          </div>
        </div>
      )}
      {boardDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => !boardBusy && setBoardDialog(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-cream rounded-3xl w-full max-w-[420px] p-6">
            <h2 className="text-[19px] font-semibold mb-1">{boardDialog.mode === "new" ? "New sub board" : "Rename board"}</h2>
            <p className="text-[13px] text-muted mb-4">
              {boardDialog.mode === "new"
                ? "Sub boards appear under Task Board in the sidebar, for example “Email Tasks” or “Real Estate”."
                : "Everyone in your workspace sees the new name."}
            </p>
            <input
              autoFocus
              value={boardDialog.name}
              maxLength={80}
              onChange={(e) => setBoardDialog({ ...boardDialog, name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && saveBoard()}
              placeholder="Board name"
              className="w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none focus:border-ink mb-3"
            />
            {boardError && <div className="text-[12.5px] text-red-600 mb-3">{boardError}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setBoardDialog(null)} disabled={boardBusy} className="px-4 py-2 rounded-full text-[13.5px] font-medium text-muted hover:text-ink">
                Cancel
              </button>
              <button
                onClick={saveBoard}
                disabled={boardBusy || !boardDialog.name.trim()}
                className="bg-btn text-ink px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-btn-hover disabled:opacity-40"
              >
                {boardBusy ? "Saving…" : boardDialog.mode === "new" ? "Create board" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center bg-chip rounded-full p-1">
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
        {view === "board" && (
          <div className="relative mr-auto">
            <button
              onClick={() => setJumpOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={jumpOpen}
              title="Jump to a column"
              className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3.5 py-2 rounded-full text-[13.5px] font-medium transition-colors"
            >
              <Columns3 size={14} strokeWidth={1.75} />
              Columns
              <span className="text-muted">
                {onScreen.size && onScreen.size < shownColumns.length ? `${onScreen.size}/${shownColumns.length}` : shownColumns.length}
              </span>
              <ChevronDown size={13} strokeWidth={2} className="text-muted" />
            </button>
            {jumpOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setJumpOpen(false)} />
                <div
                  role="menu"
                  className="absolute left-0 top-[calc(100%+6px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 w-[260px] max-h-[60vh] overflow-y-auto"
                >
                  <div className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Jump to column</div>
                  {shownColumns.map((c) => (
                    <button
                      key={c.id}
                      role="menuitem"
                      onClick={() => jumpTo(c.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13.5px] text-left hover:bg-chip transition-colors"
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                      <span className="flex-1 truncate font-medium">{c.title}</span>
                      {collapsed.has(c.id) && <span className="text-[11.5px] text-muted">collapsed</span>}
                      <span className="text-[12px] text-muted">{tasksFor(c).length}</span>
                      <Check size={13} strokeWidth={2} className={onScreen.has(c.id) && !collapsed.has(c.id) ? "text-ink" : "opacity-0"} />
                    </button>
                  ))}
                  {collapsed.size > 0 && (
                    <>
                      <div className="border-t border-line my-1" />
                      <button
                        onClick={() => {
                          setJumpOpen(false);
                          setCollapsed(() => {
                            writeCollapsed(layoutKey, new Set());
                            return new Set();
                          });
                        }}
                        className="w-full px-3 py-2 rounded-xl text-[13px] text-left font-medium hover:bg-chip transition-colors"
                      >
                        Expand all columns
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          {searchOpen ? (
            <div className="flex items-center gap-2 bg-white border border-line rounded-full pl-3 pr-1.5 h-9 w-[240px] focus-within:border-ink">
              <Search size={14} strokeWidth={1.75} className="text-muted flex-shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                // Clicking anywhere else closes the box; the search itself stays on.
                onBlur={() => setSearchOpen(false)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setQuery("");
                    setSearchOpen(false);
                  }
                }}
                placeholder="Search tasks"
                className="flex-1 min-w-0 bg-transparent outline-none text-[13.5px] placeholder:text-muted"
              />
              <button
                // mousedown runs before the input's blur, so the click isn't lost
                onMouseDown={(e) => {
                  e.preventDefault();
                  setQuery("");
                  setSearchOpen(false);
                }}
                className="w-6 h-6 rounded-full hover:bg-chip flex items-center justify-center text-muted hover:text-ink"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              title={query.trim() ? `Searching for “${query.trim()}”` : "Search tasks"}
              aria-label={query.trim() ? `Searching for ${query.trim()}. Edit search` : "Search tasks"}
              className={`w-9 h-9 rounded-full transition-colors flex items-center justify-center ${
                query.trim() ? "bg-btn text-ink" : "bg-chip hover:bg-btn"
              }`}
            >
              <Search size={15} strokeWidth={1.75} />
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setFilterOpen((o) => !o)}
              title="Filter tasks"
              aria-label="Filter tasks"
              className={`w-9 h-9 rounded-full transition-colors flex items-center justify-center relative ${advCount ? "bg-btn text-ink" : "bg-chip hover:bg-btn"}`}
            >
              <Filter size={15} strokeWidth={1.75} />
              {advCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-[#1F3A93] text-white text-[10.5px] font-semibold flex items-center justify-center">
                  {advCount}
                </span>
              )}
            </button>
            {filterOpen && <FilterMenu value={adv} onChange={setAdv} members={teamMembers} onClose={() => setFilterOpen(false)} />}
          </div>
          <div className="relative">
            <button
              onClick={() => setDisplayOpen((o) => !o)}
              title="Display options"
              aria-label="Display options"
              className={`w-9 h-9 rounded-full transition-colors flex items-center justify-center ${
                display.sort !== "manual" || display.hideDone ? "bg-btn text-ink" : "bg-chip hover:bg-btn"
              }`}
            >
              <SlidersHorizontal size={15} strokeWidth={1.75} />
            </button>
            {displayOpen && <DisplayMenu value={display} onChange={setDisplay} onClose={() => setDisplayOpen(false)} />}
          </div>
          <button
            onClick={() => setModalStatus("todo")}
            className="bg-btn text-ink px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 hover:bg-btn-hover transition-colors"
          >
            <Plus size={14} strokeWidth={2} /> Add task
          </button>
          <button
            onClick={() => setTemplatesOpen(true)}
            title="Checklist templates you can add to any task"
            className="bg-btn text-ink px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 hover:bg-btn-hover transition-colors"
          >
            <Plus size={14} strokeWidth={2} /> Add template
          </button>
          {boardKey && (
            <div className="relative">
              <button
                onClick={() => {
                  setNewColumnName("");
                  setAddingColumn((o) => !o);
                }}
                className="bg-btn text-ink px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 hover:bg-btn-hover transition-colors"
              >
                <Plus size={14} strokeWidth={2} /> Add column
              </button>
              {addingColumn && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAddingColumn(false)} />
                  <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[260px] bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-3">
                    <input
                      autoFocus
                      value={newColumnName}
                      maxLength={60}
                      onChange={(e) => setNewColumnName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addColumn();
                        if (e.key === "Escape") setAddingColumn(false);
                      }}
                      placeholder="Column name, e.g. Clients"
                      className="w-full bg-card-alt rounded-xl px-3 py-2 text-[13.5px] outline-none placeholder:text-muted mb-2"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setAddingColumn(false)} className="px-3 py-1.5 rounded-full text-[13px] font-medium text-muted hover:text-ink">
                        Cancel
                      </button>
                      <button
                        onClick={addColumn}
                        disabled={!newColumnName.trim()}
                        className="bg-btn text-ink px-3.5 py-1.5 rounded-full text-[13px] font-medium hover:bg-btn-hover disabled:opacity-40"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {tasksError && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">
          <span>{tasksError}</span>
          <button onClick={clearTasksError} className="text-red-500 hover:text-red-700">
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {filterPills.map((f) => (
          <button
            key={f}
            onClick={() => toggleFilter(f)}
            className={`px-3.5 py-1.5 rounded-full text-[13.5px] font-medium transition-colors ${
              activeFilters.includes(f) ? "bg-btn text-ink" : "bg-chip text-muted hover:text-ink"
            }`}
          >
            {f}
          </button>
        ))}
        {customFilters.map((cf) => {
          const key = `cf:${cf.id}`;
          return (
            <span key={cf.id} className="group relative">
              <button
                onClick={() => toggleFilter(key)}
                className={`pl-3.5 pr-3.5 group-hover:pr-7 py-1.5 rounded-full text-[13.5px] font-medium transition-all ${
                  activeFilters.includes(key) ? "bg-btn text-ink" : "bg-chip text-muted hover:text-ink"
                }`}
              >
                {filterLabel(cf, nameOf)}
              </button>
              <button
                onClick={() => void removeCustomFilter(cf.id)}
                aria-label={`Remove filter ${filterLabel(cf, nameOf)}`}
                title="Remove this filter from this board"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full hidden group-hover:flex items-center justify-center text-muted hover:text-[#B42318] hover:bg-white"
              >
                <X size={11} />
              </button>
            </span>
          );
        })}
        <div className="relative">
          <button
            onClick={() => setAddFilterOpen((o) => !o)}
            className="flex items-center gap-1 px-3.5 py-1.5 rounded-full text-[13.5px] font-medium bg-white border border-dashed border-line text-muted hover:text-ink hover:border-[#AEB8C6] transition-colors"
          >
            <Plus size={13} /> Add more
          </button>
          {addFilterOpen && (
            <AddFilterMenu
              existing={customFilters}
              members={members}
              onAdd={(f) => void addCustomFilter(f)}
              onClose={() => setAddFilterOpen(false)}
            />
          )}
        </div>
        {filterError && <span className="text-[12.5px] text-[#B42318]">{filterError}</span>}
        <div className="relative">
          <button
            onClick={() => setMatterMenuOpen((o) => !o)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13.5px] font-medium transition-colors ${
              filterMatter ? "bg-btn text-ink" : "bg-chip text-muted hover:text-ink"
            }`}
          >
            {filterMatter ? filterMatter.matterNumber ?? filterMatter.title : "Matter"} <ChevronDown size={12} strokeWidth={1.75} />
          </button>
          {matterMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMatterMenuOpen(false)} />
              <div className="absolute left-0 top-[calc(100%+6px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 w-[300px] max-h-[360px] overflow-y-auto">
                {matterFilter && (
                  <button
                    onClick={() => {
                      setMatterFilter(null);
                      setMatterMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-[13.5px] font-medium text-muted hover:bg-chip"
                  >
                    All matters
                  </button>
                )}
                {matterOptions.length === 0 ? (
                  <div className="px-3 py-2.5 text-[13px] text-muted">No matters yet</div>
                ) : (
                  matterOptions.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setMatterFilter(m.id);
                        setMatterMenuOpen(false);
                      }}
                      className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl text-[13.5px] hover:bg-chip ${m.id === matterFilter ? "bg-chip" : ""}`}
                    >
                      {m.matterNumber && <span className="font-semibold flex-shrink-0">{m.matterNumber}</span>}
                      <span className="truncate text-muted">{m.title}</span>
                      {matterIdsHere.has(m.id) && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#3B82F6] flex-shrink-0" title="Has tasks here" />}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {narrowing && (
        <div className="-mt-3 mb-5 flex items-center gap-3 text-[13px] text-muted flex-wrap">
          <span>
            Showing {tasks.length} of {allTasks.length} {allTasks.length === 1 ? "task" : "tasks"}
            {(() => {
              const parts = [
                ...(filterMatter ? [filterMatter.matterNumber ?? filterMatter.title] : []),
                ...activeFilters.filter((f) => tests[f]).map((f) => (f.startsWith("cf:") ? customLabel(f) : f)),
                ...(query.trim() ? [`“${query.trim()}”`] : []),
                ...(advCount ? [`${advCount} ${advCount === 1 ? "filter" : "filters"}`] : []),
              ];
              return parts.length ? (
                <>
                  : <span className="text-ink font-medium">{parts.join(", ")}</span>
                </>
              ) : null;
            })()}
          </span>
          <button
            onClick={() => {
              setActiveFilters([]);
              setMatterFilter(null);
              setQuery("");
              setSearchOpen(false);
              setAdv(NO_FILTERS);
            }}
            className="font-medium underline underline-offset-2 hover:text-ink transition-colors"
          >
            Show all tasks
          </button>
        </div>
      )}

      {view === "list" ? (
        <div className="border border-line rounded-2xl min-h-[420px] flex flex-col items-center justify-center text-center">
          {!tasksLoaded ? (
            <div className="text-[14px] text-muted">Loading tasks…</div>
          ) : tasks.length === 0 ? (
            <>
              <ClipboardList size={26} strokeWidth={1.5} className="text-muted mb-4" />
              <div className="text-[16px] font-semibold mb-4">
                {allTasks.length > 0 ? "No tasks match these filters" : "No tasks yet"}
              </div>
              <button
                onClick={() => setModalStatus("todo")}
                className="bg-btn text-ink px-4 py-2.5 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 hover:bg-btn-hover transition-colors"
              >
                <Plus size={14} strokeWidth={2} /> Add task
              </button>
            </>
          ) : (
            <div className="w-full divide-y divide-line">
              {tasks.map((t) => {
                const Icon = statusMeta[t.status].icon;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTask(t)}
                    className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-chip/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={15} strokeWidth={2} className={statusMeta[t.status].color} />
                      <span className="text-[14.5px] font-medium">{t.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const m = t.matterId ? matters.find((x) => x.id === t.matterId) : null;
                        if (!m) return null;
                        return (
                          <Link
                            href={`/dashboard/matters/${m.id}`}
                            onClick={(e) => e.stopPropagation()}
                            title={`Open matter: ${m.title}`}
                            className="text-[11.5px] font-semibold tracking-wide bg-[#E1E7F4] hover:bg-[#D5DDEE] hover:underline underline-offset-2 rounded-md px-1.5 py-0.5 truncate max-w-[160px]"
                          >
                            {m.matterNumber ?? m.title}
                          </Link>
                        );
                      })()}
                      <PriorityDot priority={t.priority} />
                    </div>
                    {boardId === null && (
                      <span className="text-[11.5px] text-muted bg-card-alt rounded-md px-1.5 py-0.5 truncate max-w-[140px]">
                        {t.boardId ? boards.find((b) => b.id === t.boardId)?.name ?? "Board" : generalName}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="relative">
          {/* Fades and arrows show there are more columns off to the side. */}
          {edges.left && (
            <>
              <div className="pointer-events-none absolute left-0 top-0 bottom-3 w-12 z-20 bg-gradient-to-r from-page to-transparent" />
              <button
                onClick={() => scrollByColumn(-1)}
                aria-label="Show columns on the left"
                className="absolute left-1 top-1/2 -translate-y-1/2 z-30 w-[44px] h-[44px] rounded-full bg-white shadow-md flex items-center justify-center hover:bg-chip transition-colors"
              >
                <ChevronLeft size={21} strokeWidth={2} />
              </button>
            </>
          )}
          {edges.right && (
            <>
              <div className="pointer-events-none absolute right-0 top-0 bottom-3 w-12 z-20 bg-gradient-to-l from-page to-transparent" />
              <button
                onClick={() => scrollByColumn(1)}
                aria-label="Show columns on the right"
                className="absolute right-1 top-1/2 -translate-y-1/2 z-30 w-[44px] h-[44px] rounded-full bg-white shadow-md flex items-center justify-center hover:bg-chip transition-colors"
              >
                <ChevronRight size={21} strokeWidth={2} />
              </button>
            </>
          )}
        <div
          ref={scrollerRef}
          onScroll={measure}
          style={{ height: boardHeight ?? undefined, gap: COLUMN_GAP }}
          className="relative flex w-full items-stretch overflow-x-auto overflow-y-hidden snap-x snap-proximity scroll-smooth pb-3 [scrollbar-width:thin]"
        >
          {shownColumns.map((col) => {
            const colTasks = tasksFor(col);
            const setRef = (node: HTMLElement | null) => {
              if (node) colRefs.current.set(col.id, node);
              else colRefs.current.delete(col.id);
            };
            if (collapsed.has(col.id)) {
              return (
                <button
                  key={col.id}
                  ref={setRef}
                  onClick={() => toggleCollapsed(col.id, false)}
                  title={`Expand ${col.title}`}
                  {...dropProps(col)}
                  className={`snap-start flex-shrink-0 w-[52px] border rounded-2xl flex flex-col items-center gap-3 py-4 transition-colors ${
                    dropCol === col.id ? "border-btn-ring bg-chip" : "border-line bg-card-alt hover:bg-line/50"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
                  <span className="text-[12px] text-muted bg-cream rounded-full px-1.5">{colTasks.length}</span>
                  <span className="text-[14px] font-semibold [writing-mode:vertical-rl] truncate max-h-[70%]">{col.title}</span>
                </button>
              );
            }
            return (
              <div
                key={col.id}
                ref={setRef}
                style={{
                  flex: `0 0 ${COLUMN_WIDTH}`,
                  minWidth: COLUMN_MIN,
                  // Empty columns are half height, with "Add a task" centered. Columns with tasks
                  // are only as tall as their cards (growing as cards are added, up to the
                  // board's height, then scrolling inside).
                  ...(colTasks.length === 0
                    ? { height: "50%", minHeight: 220, alignSelf: "flex-start" }
                    : { alignSelf: "flex-start", maxHeight: "100%", minHeight: 220 }),
                }}
                {...dropProps(col)}
                className={`snap-start border rounded-2xl flex flex-col min-h-0 transition-colors ${
                  dropCol === col.id ? "border-btn-ring bg-chip" : "border-line bg-card-alt"
                }`}
              >
                <div className="flex items-center justify-between gap-2 px-4 py-3">
                  <div className="flex items-center gap-2 min-w-0">
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
                      <span className="text-[14px] font-semibold truncate" title={col.title}>
                        {col.title}
                      </span>
                    )}
                    <span className="text-[12px] text-muted bg-card-alt rounded-full px-1.5 flex-shrink-0">
                      {colTasks.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 relative flex-shrink-0">
                    <button
                      onClick={() => {
                        setInlineAddFor(col.id);
                        setInlineValue("");
                      }}
                      className="w-6 h-6 rounded-full hover:bg-chip flex items-center justify-center text-muted hover:text-ink transition-colors"
                    >
                      <Plus size={14} strokeWidth={1.75} />
                    </button>
                    <button
                      onClick={() => setMenuOpenFor(menuOpenFor === col.id ? null : col.id)}
                      className="w-6 h-6 rounded-full hover:bg-chip flex items-center justify-center text-muted hover:text-ink transition-colors"
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
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip transition-colors"
                          >
                            <Pencil size={14} strokeWidth={1.75} /> Rename
                          </button>
                          <button
                            onClick={() => {
                              setColorPickerFor(col.id);
                              setMenuOpenFor(null);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip transition-colors"
                          >
                            <Palette size={14} strokeWidth={1.75} /> Recolor
                          </button>
                          <button
                            onClick={() => {
                              setMenuOpenFor(null);
                              toggleCollapsed(col.id, true);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip transition-colors"
                          >
                            <ChevronsRightLeft size={14} strokeWidth={1.75} /> Collapse
                          </button>
                          {col.custom && (
                            <>
                              <div className="border-t border-line my-1" />
                              <button
                                onClick={() => deleteColumn(col.id)}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium text-red-500 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 size={14} strokeWidth={1.75} /> Delete column
                              </button>
                            </>
                          )}
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

                {/* More than 5 cards: about 5 show, the rest scroll (visible scroll bar);
                    "Add a task" stays pinned at the bottom. */}
                <div
                  className={`px-2.5 pt-1.5 -mt-1.5 flex-1 min-h-0 overflow-y-auto flex flex-col ${colTasks.length > 5 ? "scroll-on-hover pr-1" : "pb-3"}`}
                  style={colTasks.length > 5 ? { maxHeight: 560 } : undefined}
                >
                  {colTasks.length === 0 && inlineAddFor !== col.id ? (
                    <button
                      onClick={() => {
                        setInlineAddFor(col.id);
                        setInlineValue("");
                      }}
                      className="flex-1 bg-cream rounded-xl flex flex-col items-center justify-center gap-1.5 text-muted hover:text-ink transition-colors"
                    >
                      <Plus size={16} strokeWidth={1.75} />
                      <span className="text-[13px]">Add a task</span>
                    </button>
                  ) : colTasks.length === 0 && inlineAddFor === col.id ? (
                    <div className="flex-1 bg-cream rounded-xl px-4 pt-3">
                      <input
                        autoFocus
                        value={inlineValue}
                        onChange={(e) => setInlineValue(e.target.value)}
                        onBlur={() => addInlineTask(col)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addInlineTask(col);
                          if (e.key === "Escape") setInlineAddFor(null);
                        }}
                        placeholder="Task title (Enter to add, Esc to cancel)"
                        className="w-full bg-cream border border-line rounded-xl px-3.5 py-3 text-[13.5px] outline-none placeholder:text-muted"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {inlineAddFor === col.id && (
                        <input
                          autoFocus
                          value={inlineValue}
                          onChange={(e) => setInlineValue(e.target.value)}
                          onBlur={() => addInlineTask(col)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addInlineTask(col);
                            if (e.key === "Escape") setInlineAddFor(null);
                          }}
                          placeholder="Task title (Enter to add, Esc to cancel)"
                          className="w-full bg-cream border border-line rounded-xl px-3.5 py-3 text-[13.5px] outline-none placeholder:text-muted"
                        />
                      )}

                      {colTasks.map((t) => (
                        <Fragment key={t.id}>
                        <div
                          key={t.id}
                          onClick={() => setSelectedTask(t)}
                          data-task-card
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", t.id);
                            e.dataTransfer.effectAllowed = "move";
                            setDragId(t.id);
                          }}
                          onDragEnd={endDrag}
                          onDragOver={(e) => {
                            if (!dragId) return;
                            const r = e.currentTarget.getBoundingClientRect();
                            const upper = e.clientY < r.top + r.height / 2;
                            const i = colTasks.findIndex((x) => x.id === t.id);
                            const target = upper ? t.id : (colTasks[i + 1]?.id ?? null);
                            if (dropBefore !== target) setDropBefore(target);
                          }}
                          className={`${dragId === t.id ? "opacity-40" : ""} relative bg-page rounded-xl px-3 py-3 cursor-pointer shadow-[0_1px_3px_rgba(27,25,26,0.08),0_1px_2px_rgba(27,25,26,0.04)] hover:shadow-[0_4px_12px_rgba(27,25,26,0.10),0_2px_4px_rgba(27,25,26,0.05)] transition-shadow`}
                        >
                          {dragId && dragId !== t.id && dropCol === col.id && dropBefore === t.id && (
                            <span className="absolute left-1 right-1 -top-[5.5px] h-[3px] rounded-full bg-[#3B82F6] pointer-events-none" aria-hidden />
                          )}
                          {dragId && dragId !== t.id && dropCol === col.id && dropBefore === null && t.id === colTasks[colTasks.length - 1]?.id && (
                            <span className="absolute left-1 right-1 -bottom-[5.5px] h-[3px] rounded-full bg-[#3B82F6] pointer-events-none" aria-hidden />
                          )}
                          <div className="flex items-start justify-between gap-1.5 mb-2.5">
                            <div className="min-w-0">
                              <div className="text-[12px] font-semibold leading-snug line-clamp-2 break-words" title={t.title}>{t.title}</div>
                              {t.status !== "done" && (
                                <div className="mt-1">
                                  <NextStepLine task={t} />
                                </div>
                              )}
                            </div>
                            <div className="relative flex-shrink-0 -mt-0.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCardMenuFor(cardMenuFor === t.id ? null : t.id);
                                }}
                                className="text-muted hover:text-ink"
                              >
                                <MoreHorizontal size={15} strokeWidth={1.75} />
                              </button>
                              {cardMenuFor === t.id && (
                                <>
                                  <div
                                    className="fixed inset-0 z-40"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCardMenuFor(null);
                                    }}
                                  />
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute right-0 top-[calc(100%+4px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 w-[160px]"
                                  >
                                    <button
                                      onClick={() => {
                                        setCardMenuFor(null);
                                        setSelectedTask(t);
                                      }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip transition-colors"
                                    >
                                      <Pencil size={14} strokeWidth={1.75} /> Open
                                    </button>
                                    <button
                                      onClick={() => {
                                        setCardMenuFor(null);
                                        deleteTasks([t.id]);
                                      }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium text-red-500 hover:bg-red-50 transition-colors"
                                    >
                                      <Trash2 size={14} strokeWidth={1.75} /> Delete
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {t.createdBy ? (
                              <MemberAvatar userId={t.createdBy} size={24} light />
                            ) : (
                              <span className="w-6 h-6 rounded-full bg-card-alt border border-line flex items-center justify-center flex-shrink-0">
                                <User size={12} strokeWidth={1.75} className="text-muted" />
                              </span>
                            )}
                            <PriorityDot priority={t.priority} />
                            {(() => {
                              const cp = checklistProgress(t.checklist);
                              if (!cp.total) return null;
                              const all = cp.done === cp.total;
                              const al = checklistAlerts(t.checklist);
                              return (
                                <>
                                {al.overdue > 0 && (
                                  <span title="Checklist steps past their due date" className="text-[11.5px] font-medium rounded-md px-1.5 py-0.5 bg-[#F9B2B3] text-ink">
                                    {al.overdue} overdue
                                  </span>
                                )}
                                {al.overdue === 0 && al.soon > 0 && (
                                  <span title="Checklist steps due in the next 3 days" className="text-[11.5px] font-medium rounded-md px-1.5 py-0.5 bg-[#F9E1C0] text-ink">
                                    {al.soon} due soon
                                  </span>
                                )}
                                <span
                                  title="Checklist"
                                  className={`flex items-center gap-1 text-[11.5px] font-medium rounded-md px-1.5 py-0.5 ${all ? "bg-[#CAF0D9] text-ink" : "bg-card-alt text-muted"}`}
                                >
                                  <ListChecks size={12} strokeWidth={1.75} />
                                  {cp.done}/{cp.total}
                                </span>
                                </>
                              );
                            })()}
                            {!t.assignee && (t.offeredTo ?? []).length > 0 && (
                              <span className="text-[11.5px] font-medium bg-[#FFF1DE] text-[#8A4B14] rounded-md px-1.5 py-0.5" title={`Offered to ${(t.offeredTo ?? []).join(", ")}`}>
                                Offered to {(t.offeredTo ?? []).length}
                              </span>
                            )}
                            {t.waitingOn && (
                              <span className="text-[11.5px] font-medium bg-[#FCEFD9] text-[#8A4B14] rounded-md px-1.5 py-0.5" title="Who this task is waiting on">
                                Waiting on {waitingLabel(t.waitingOn)}
                              </span>
                            )}
                            {(() => {
                              const m = t.matterId ? matters.find((x) => x.id === t.matterId) : null;
                              if (!m) return null;
                              return (
                                <Link
                                  href={`/dashboard/matters/${m.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  draggable={false}
                                  title={`Open matter: ${m.title}`}
                                  className="text-[11.5px] font-semibold tracking-wide bg-[#E1E7F4] hover:bg-[#D5DDEE] hover:underline underline-offset-2 cursor-pointer rounded-md px-1.5 py-0.5 truncate max-w-[140px]"
                                >
                                  {m.matterNumber ?? m.title}
                                </Link>
                              );
                            })()}
                            {boardId === null && !createdBy && (
                              <span className="text-[11.5px] text-muted bg-card-alt rounded-md px-1.5 py-0.5 truncate max-w-[130px]">
                                {t.boardId ? boards.find((b) => b.id === t.boardId)?.name ?? "Board" : generalName}
                              </span>
                            )}
                          </div>
                        </div>
                        </Fragment>
                      ))}

                      {inlineAddFor !== col.id && (
                        <button
                          onClick={() => {
                            setInlineAddFor(col.id);
                            setInlineValue("");
                          }}
                          className="sticky bottom-0 z-[1] flex items-center justify-center gap-1.5 py-3 bg-card-alt text-muted hover:text-ink transition-colors"
                        >
                          <Plus size={15} strokeWidth={1.75} />
                          <span className="text-[13px]">Add a task</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </div>
      )}

      {modalStatus && (
        <NewTaskModal
          defaultStatus={modalStatus}
          onClose={() => setModalStatus(null)}
          onCreate={(task) => {
            addTask({ ...task, comments: [] });
            setModalStatus(null);
          }}
        />
      )}

      {templatesOpen && <TemplatesModal onClose={() => setTemplatesOpen(false)} />}
      {openTask && (
        <TaskDetailModal
          task={openTask}
          onClose={() => {
            setSelectedTask(null);
            setLinkDismissed(true);
          }}
          onUpdate={(updated) => {
            updateTask(updated);
            setSelectedTask(updated);
          }}
        />
      )}
    </div>
  );
}
