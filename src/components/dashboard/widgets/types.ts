import type { BoardTask } from "@/components/NewTaskModal";
import type { Matter } from "@/components/NewMatterModal";
import type { Client } from "@/components/NewClientModal";

// Dashboard widgets: sizes on a 6-column grid (4 on laptops, 2 on phones).
//   s  = 1 column × 1 row      m  = 2 × 1      l = 2 × 2
//   w  = 4 columns × 1 row     xl = 4 × 2
export type WidgetSize = "s" | "m" | "l" | "w" | "xl";
export const SIZE_LABEL: Record<WidgetSize, string> = { s: "Small", m: "Medium", l: "Large", w: "Wide", xl: "Extra large" };
export const SIZE_CLASS: Record<WidgetSize, string> = {
  s: "col-span-1 row-span-1",
  m: "col-span-2 row-span-1",
  l: "col-span-2 row-span-2",
  w: "col-span-2 md:col-span-4 row-span-1",
  xl: "col-span-2 md:col-span-4 row-span-2",
};

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
  priorityFilter: "High" | "Medium" | "Low" | null;
  setPriorityFilter: (p: "High" | "Medium" | "Low" | null) => void;
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
  title?: (d: DashData) => string; // header text (defaults to name)
  action?: (d: DashData) => React.ReactNode; // a link on the right of the header
  plain?: boolean; // no header (the widget draws its own)
  tone?: string; // background class (defaults to bg-card-alt)
  body: (d: DashData, size: WidgetSize) => React.ReactNode;
};
