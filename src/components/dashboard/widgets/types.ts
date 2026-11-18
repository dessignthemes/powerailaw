import type { BoardTask } from "@/components/NewTaskModal";
import type { Matter } from "@/components/NewMatterModal";
import type { Client } from "@/components/NewClientModal";

// Dashboard widgets: sizes on a 4-column grid (2 on phones).
//   s  = a quarter (1 column × 1 row)   m = half (2 × 1)   l = half, twice as tall (2 × 2)
//   w  = full width (4 × 1)            xl = full width, twice as tall (4 × 2)
export type WidgetSize = "s" | "m" | "l" | "w" | "xl";
export const SIZE_LABEL: Record<WidgetSize, string> = { s: "Small", m: "Medium", l: "Large", w: "Wide", xl: "Extra large" };
// The grid fits up to 5 square columns across the page (1 on a phone), each
// column as tall as it is wide, so Small is always a square and every box lines
// up: span = [columns, rows].
export const SIZE_SPAN: Record<WidgetSize, [number, number]> = { s: [1, 1], m: [2, 1], l: [2, 2], w: [4, 1], xl: [4, 2] };
export const GRID_GAP = 20;
export const MIN_COL = 230; // narrower than this and the grid drops a column
export const MAX_COLS = 5;

export type LayoutItem = { id: string; size: WidgetSize };

export type DashEvent = { id: string; provider: "google" | "microsoft"; title: string; start: string; end: string; allDay: boolean; location: string | null; link: string | null };
export type RangeKey = "today" | "week" | "month";

// Everything the widgets read, worked out once on the Dashboard.
export type DashData = {
  range: RangeKey;
  dueLabel: string; // "Due today" / "Due this week" / "Due this month"
  rangeWord: string; // "today" / "this week" / "this month"
  tasks: BoardTask[]; // the scope picked under View Team Tasks
  allTasks: BoardTask[];
  tasksLoaded: boolean;
  dueTasks: BoardTask[];
  undatedTasks: BoardTask[];
  openCount: number;
  recent: BoardTask[];
  todayStr: string;
  cal: { events: DashEvent[]; connected: boolean; loaded: boolean };
  eventsIn: (k: RangeKey) => DashEvent[];
  allEvents: DashEvent[];
  matters: Matter[];
  clients: Client[];
  teamMembers: { id: string; email: string; fullName?: string | null; role: string }[];
  meEmail: string | null;
  boardName: (id: string | null | undefined) => string;
  generalName: string;
  openTask: (t: BoardTask) => void;
  openEvent: (e: DashEvent) => void;
  toggleDone: (t: BoardTask) => void;
  renderTaskRow: (t: BoardTask) => React.ReactNode;
  priorityFilter: "High" | "Medium" | "Low" | "Overdue" | null;
  setPriorityFilter: (p: "High" | "Medium" | "Low" | "Overdue" | null) => void;
  setScope: (s: string) => void;
  fmtTime: (e: DashEvent) => string;
  eventStart: (e: DashEvent) => Date;
};

export type WidgetDef = {
  id: string;
  name: string;
  desc: string;
  category: "Tasks" | "Calendar" | "Matters" | "Clients and intake" | "Firm" | "AI and tools";
  sizes: WidgetSize[];
  size: WidgetSize; // the size it's added at
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title?: (d: DashData) => React.ReactNode; // header text (defaults to name)
  action?: (d: DashData) => React.ReactNode; // a link on the right of the header
  plain?: boolean; // no header (the widget draws its own)
  tone?: string; // background class (defaults to bg-card-alt)
  inner?: string; // inside panel's background class (defaults to bg-white)
  body: (d: DashData, size: WidgetSize) => React.ReactNode;
};
