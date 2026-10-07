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

// ---------------------------------------------------------------------------
// Automatic task timer: starts when a task is opened, saves when it is closed.
// Sessions are mirrored to localStorage so time isn't lost if the browser
// closes or a save fails; they are saved the next time any task is opened.
// ---------------------------------------------------------------------------
export type TaskSession = {
  id: string;
  taskId: string;
  title: string;
  startedAt: string;
  activeMs: number; // time actually counted (paused time and sleep gaps excluded)
  running: boolean;
  lastSeen: number; // last heartbeat (ms since epoch)
  closed?: boolean; // finished but not yet saved (save failed)
};

const SESSIONS_KEY = "lawpower.taskSessions";
const AUTO_KEY = "lawpower.autoTimer";
export const MIN_SAVE_MS = 30_000; // a quick look under 30 seconds isn't recorded
const ORPHAN_AFTER_MS = 3 * 60_000;

function readSessions(): Record<string, TaskSession> {
  try {
    return JSON.parse(window.localStorage.getItem(SESSIONS_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}
function writeSessions(all: Record<string, TaskSession>) {
  try {
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
  } catch {
    // private mode: the timer still works while the task is open
  }
}
export function storeSession(s: TaskSession) {
  writeSessions({ ...readSessions(), [s.id]: s });
}
export function dropSession(id: string) {
  const all = readSessions();
  delete all[id];
  writeSessions(all);
}

export function getAutoTimer() {
  try {
    return window.localStorage.getItem(AUTO_KEY) !== "off";
  } catch {
    return true;
  }
}
export function setAutoTimer(on: boolean) {
  try {
    window.localStorage.setItem(AUTO_KEY, on ? "on" : "off");
  } catch {
    // preference just won't be remembered
  }
}

export function newSession(taskId: string, title: string): TaskSession {
  return { id: crypto.randomUUID(), taskId, title, startedAt: new Date().toISOString(), activeMs: 0, running: true, lastSeen: Date.now() };
}

// Saves a finished session as one time entry. Returns the minutes saved (0 = too short, nothing saved).
export async function saveSession(s: TaskSession, endedAt = new Date()) {
  if (s.activeMs < MIN_SAVE_MS) return 0;
  const minutes = Math.min(1440, Math.max(1, Math.round(s.activeMs / 60_000)));
  const res = await fetch("/api/time-entries", {
    method: "POST",
    keepalive: true, // lets the save finish even if the page is closing
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      date: localYmd(new Date(s.startedAt)),
      startedAt: s.startedAt,
      endedAt: endedAt.toISOString(),
      minutes,
      description: s.title,
      taskId: s.taskId,
      billable: true,
      source: "timer",
    }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d?.error ?? "Couldn't save the time.");
  return minutes;
}

// Saves sessions left behind by a closed browser or a failed save.
export async function recoverSessions(): Promise<number> {
  const now = Date.now();
  const left = Object.values(readSessions()).filter((s) => s.closed || now - s.lastSeen > ORPHAN_AFTER_MS);
  let saved = 0;
  for (const s of left) {
    dropSession(s.id);
    try {
      if (await saveSession(s, new Date(s.lastSeen))) saved++;
    } catch {
      storeSession({ ...s, closed: true }); // try again next time
    }
  }
  // The old manual timer (before auto-timing) is no longer used.
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
  return saved;
}
