import type { BoardTask } from "@/components/NewTaskModal";

export type DueRange = "today" | "week" | "nextweek";

// Due dates are stored as "YYYY-MM-DD" (from <input type="date">), so all
// comparisons use local calendar dates in that same format.
export function ymd(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function rangeBounds(range: DueRange) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (today.getDay() + 6) % 7; // Monday = 0
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - dow);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const todayStr = ymd(today);

  if (range === "today") return { start: todayStr, end: todayStr, includeOverdue: true, today: todayStr };
  if (range === "week") return { start: todayStr, end: ymd(weekEnd), includeOverdue: true, today: todayStr };

  const nextStart = new Date(weekStart);
  nextStart.setDate(weekStart.getDate() + 7);
  const nextEnd = new Date(nextStart);
  nextEnd.setDate(nextStart.getDate() + 6);
  return { start: ymd(nextStart), end: ymd(nextEnd), includeOverdue: false, today: todayStr };
}

// Open (not done) tasks due in the range. "today" and "week" also include
// anything overdue, since that still needs doing.
export function isDueIn(t: BoardTask, range: DueRange) {
  if (t.status === "done" || !t.dueDate) return false;
  const b = rangeBounds(range);
  return (t.dueDate >= b.start && t.dueDate <= b.end) || (b.includeOverdue && t.dueDate < b.today);
}

export function isOverdue(t: BoardTask) {
  return t.status !== "done" && !!t.dueDate && t.dueDate < ymd(new Date());
}
