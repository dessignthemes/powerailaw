// One running task timer per browser, kept across page changes and reloads.
export type RunningTimer = { taskId: string; title: string; startedAt: string };
const KEY = "lawpower.taskTimer";

export function getTimer(): RunningTimer | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RunningTimer) : null;
  } catch {
    return null;
  }
}

export function startTimer(taskId: string, title: string): RunningTimer {
  const t = { taskId, title, startedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    // private mode: the timer still runs while this page is open
  }
  return t;
}

export function clearTimer() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

const pad = (n: number) => String(n).padStart(2, "0");
export const localYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Saves a stopped timer as a time entry (rounded to the nearest minute, at least 1).
export async function saveTimer(t: RunningTimer, endedAt = new Date()) {
  const seconds = Math.max(0, (endedAt.getTime() - new Date(t.startedAt).getTime()) / 1000);
  const minutes = Math.min(1440, Math.max(1, Math.round(seconds / 60)));
  const res = await fetch("/api/time-entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      date: localYmd(new Date(t.startedAt)),
      startedAt: t.startedAt,
      endedAt: endedAt.toISOString(),
      minutes,
      description: t.title,
      taskId: t.taskId,
      billable: true,
      source: "timer",
    }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d?.error ?? "Couldn't save the time.");
  return { minutes, entry: d.entry };
}

export function formatMinutes(m: number) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h ? (mm ? `${h}h ${mm}m` : `${h}h`) : `${mm}m`;
}
