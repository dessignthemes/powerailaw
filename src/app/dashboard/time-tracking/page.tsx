"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar, List, SlidersHorizontal, Plus, X, Clock, Check, ChevronDown, Trash2, Loader2, AlertTriangle, Timer, Pencil } from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import { displayName } from "@/lib/initials";
import { formatMinutes, localYmd } from "@/lib/taskTimer";
import SelectBox from "@/components/SelectBox";

type Entry = {
  id: string;
  userId: string;
  date: string;
  startedAt: string | null;
  endedAt: string | null;
  minutes: number;
  description: string;
  matterId: string | null;
  taskId: string | null;
  billable: boolean;
  rate: number | null;
  source: "manual" | "timer";
};

function getWeekStart(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatWeekRange(weekStart: Date) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const sm = weekStart.toLocaleDateString("en-US", { month: "short" });
  const em = weekEnd.toLocaleDateString("en-US", { month: "short" });
  const y = weekEnd.getFullYear();
  return sm === em ? `${sm} ${weekStart.getDate()} – ${weekEnd.getDate()}, ${y}` : `${sm} ${weekStart.getDate()} – ${em} ${weekEnd.getDate()}, ${y}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const fromMinutes = (m: number) => `${pad(Math.floor(((m % 1440) + 1440) % 1440 / 60))}:${pad(((m % 60) + 60) % 60)}`;

// "1h 30m", "90m", "1.5", "1:30", "45" (minutes) → minutes
function parseDuration(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  const hms = t.match(/^(\d+):(\d{1,2})$/);
  if (hms) return Number(hms[1]) * 60 + Number(hms[2]);
  const hm2 = t.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?$/);
  if (hm2 && (hm2[1] || hm2[2])) return Math.round(Number(hm2[1] ?? 0) * 60 + Number(hm2[2] ?? 0));
  const num = Number(t);
  if (Number.isFinite(num)) return num <= 12 && t.includes(".") ? Math.round(num * 60) : Math.round(num <= 12 ? num * 60 : num);
  return null;
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export default function TimeTrackingPage() {
  const { matters, tasks, teamMembers, meEmail } = useWorkspaceData();
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [view, setView] = useState<"timesheet" | "entries">("timesheet");
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [billable, setBillable] = useState<"all" | "billable" | "nonbillable">("all");
  const [everyone, setEveryone] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const weekLabel = useMemo(() => formatWeekRange(weekStart), [weekStart]);
  const from = localYmd(weekStart);
  const to = useMemo(() => {
    const e = new Date(weekStart);
    e.setDate(e.getDate() + 6);
    return localYmd(e);
  }, [weekStart]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/time-entries?${new URLSearchParams({ from, to, ...(everyone ? { everyone: "1" } : {}) })}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error ?? "Couldn't load time entries.");
        return d.entries as Entry[];
      })
      .then((list) => {
        if (cancelled) return;
        setEntries(list);
        setError(null);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, everyone, reloadKey]);

  const matterName = (id: string | null) => (id ? matters.find((m) => m.id === id)?.title ?? "Matter" : "No matter");
  const taskName = (id: string | null) => (id ? tasks.find((t) => t.id === id)?.title ?? null : null);
  const personName = (id: string) => {
    const m = teamMembers.find((x) => x.id === id);
    return m ? displayName(m.fullName, m.email) : "Former member";
  };
  const rateFor = (e: Entry) => e.rate ?? (e.matterId ? matters.find((m) => m.id === e.matterId)?.hourlyRate ?? null : null);

  const visible = (entries ?? []).filter((e) => (billable === "billable" ? e.billable : billable === "nonbillable" ? !e.billable : true));
  const totalMin = visible.reduce((n, e) => n + e.minutes, 0);
  const billableMin = visible.filter((e) => e.billable).reduce((n, e) => n + e.minutes, 0);
  const amount = visible.filter((e) => e.billable).reduce((n, e) => n + ((rateFor(e) ?? 0) * e.minutes) / 60, 0);

  function shiftWeek(days: number) {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + days);
    setEntries(null);
    setWeekStart(next);
  }

  async function remove(e: Entry) {
    if (!confirm(`Delete this ${formatMinutes(e.minutes)} entry?`)) return;
    const before = entries;
    setEntries((list) => (list ?? []).filter((x) => x.id !== e.id));
    const r = await fetch(`/api/time-entries/${e.id}`, { method: "DELETE" });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setEntries(before);
      setError(d?.error ?? "Couldn't delete the entry.");
    }
  }

  const isThisWeek = localYmd(getWeekStart(new Date())) === from;
  const meId = teamMembers.find((m) => m.email === meEmail)?.id;

  const row = (e: Entry, showDate: boolean) => {
    const tn = taskName(e.taskId);
    const rate = rateFor(e);
    const mine = e.userId === meId;
    return (
      <div
        key={e.id}
        onClick={mine ? () => setEditing(e) : undefined}
        title={mine ? "Click to edit" : undefined}
        className={`flex items-center justify-between gap-4 px-5 py-3.5 border-b border-line last:border-b-0 ${mine ? "cursor-pointer hover:bg-chip/40 transition-colors" : ""}`}
      >
        <div className="min-w-0">
          <div className="text-[14.5px] font-medium truncate">{e.description || tn || "Untitled entry"}</div>
          <div className="text-[12.5px] text-muted mt-0.5 truncate">
            {showDate && `${new Date(`${e.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · `}
            {matterName(e.matterId)}
            {tn && e.description !== tn ? ` · ${tn}` : ""}
            {e.startedAt && e.endedAt ? ` · ${hm(new Date(e.startedAt))} – ${hm(new Date(e.endedAt))}` : ""}
            {everyone ? ` · ${personName(e.userId)}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {e.source === "timer" && (
            <span className="text-[11.5px] text-muted flex items-center gap-1">
              <Timer size={11} /> timer
            </span>
          )}
          {e.billable ? (
            <span className="text-[11.5px] bg-card-alt px-2 py-1 rounded-full font-medium">
              Billable{rate ? ` · ${money((rate * e.minutes) / 60)}` : ""}
            </span>
          ) : (
            <span className="text-[11.5px] bg-card-alt text-muted px-2 py-1 rounded-full font-medium">Non-billable</span>
          )}
          <span className="mono text-[13.5px] font-medium w-[60px] text-right">{formatMinutes(e.minutes)}</span>
          {mine && (
            <span className="flex items-center gap-1">
              <button
                onClick={(ev) => {
                  ev.stopPropagation();
                  setEditing(e);
                }}
                aria-label="Edit entry"
                title="Edit entry"
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted bg-chip hover:text-ink hover:bg-line/70 transition-colors"
              >
                <Pencil size={13} strokeWidth={1.75} />
              </button>
              <button
                onClick={(ev) => {
                  ev.stopPropagation();
                  remove(e);
                }}
                aria-label="Delete entry"
                title="Delete entry"
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted bg-chip hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={13} strokeWidth={1.75} />
              </button>
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="px-10 py-10">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-card-alt rounded-full px-2 py-1.5">
            <button onClick={() => shiftWeek(-7)} aria-label="Previous week" className="w-6 h-6 flex items-center justify-center text-muted hover:text-ink">
              <ChevronLeft size={15} strokeWidth={1.75} />
            </button>
            <span className="text-[13.5px] font-medium px-1">{weekLabel}</span>
            <button onClick={() => shiftWeek(7)} aria-label="Next week" className="w-6 h-6 flex items-center justify-center text-muted hover:text-ink">
              <ChevronRight size={15} strokeWidth={1.75} />
            </button>
          </div>

          <div className="relative">
            <button
              onClick={() => setViewMenuOpen((o) => !o)}
              className="flex items-center gap-2 bg-chip hover:bg-line/60 transition-colors px-3.5 py-2 rounded-full text-[13.5px] font-medium"
            >
              {view === "timesheet" ? <Calendar size={14} strokeWidth={1.75} /> : <List size={14} strokeWidth={1.75} />}
              {view === "timesheet" ? "Timesheet" : "Time entries"}
              <ChevronDown size={12} strokeWidth={2} className="text-muted" />
            </button>
            {viewMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setViewMenuOpen(false)} />
                <div className="absolute left-0 top-[calc(100%+8px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 w-[190px]">
                  {(["timesheet", "entries"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => {
                        setView(v);
                        setViewMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip"
                    >
                      <span className="flex items-center gap-2.5">
                        {v === "timesheet" ? <Calendar size={15} strokeWidth={1.75} /> : <List size={15} strokeWidth={1.75} />}
                        {v === "timesheet" ? "Timesheet" : "Time entries"}
                      </span>
                      {view === v && <Check size={14} strokeWidth={2} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setFilterOpen((o) => !o)}
              aria-label="Filters"
              className={`w-9 h-9 rounded-full transition-colors flex items-center justify-center ${billable !== "all" || everyone ? "bg-btn text-ink ring-1 ring-inset ring-btn-ring" : "bg-chip hover:bg-line/60"}`}
            >
              <SlidersHorizontal size={15} strokeWidth={1.75} />
            </button>
            {filterOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />
                <div className="absolute right-0 top-[calc(100%+8px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-4 w-[290px]">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[13.5px] font-medium text-muted">Billable</span>
                    <div className="flex bg-chip rounded-full p-1">
                      {(["all", "billable", "nonbillable"] as const).map((b) => (
                        <button
                          key={b}
                          onClick={() => setBillable(b)}
                          className={`px-2.5 py-1 rounded-full text-[12.5px] font-medium ${billable === b ? "bg-white shadow-sm" : "text-muted"}`}
                        >
                          {b === "all" ? "All" : b === "billable" ? "Billable" : "Non-billable"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-line pt-4 flex items-center justify-between">
                    <span className="text-[13.5px] font-medium">Show everyone in the workspace</span>
                    <button
                      onClick={() => {
                        setEntries(null);
                        setEveryone((s) => !s);
                      }}
                      aria-pressed={everyone}
                      className={`w-10 h-6 rounded-full relative flex-shrink-0 ${everyone ? "bg-dark" : "bg-line"}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${everyone ? "left-[18px]" : "left-0.5"}`} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => {
              setEntries(null);
              setWeekStart(getWeekStart(new Date()));
            }}
            className={`px-3.5 py-2 rounded-full text-[13.5px] font-medium ${isThisWeek ? "bg-chip" : "bg-chip hover:bg-line/60"}`}
          >
            This week
          </button>

          <button
            onClick={() => setModalOpen(true)}
            className="bg-btn text-ink px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 hover:bg-btn-hover"
          >
            <Plus size={14} strokeWidth={2} /> Add entry
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700 flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {entries !== null && visible.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            ["Total", formatMinutes(totalMin)],
            ["Billable", formatMinutes(billableMin)],
            ["Billable amount", amount ? money(amount) : "—"],
          ].map(([k, v]) => (
            <div key={k} className="bg-card-alt rounded-2xl px-5 py-4">
              <div className="text-[12.5px] text-muted mb-1">{k}</div>
              <div className="text-[22px] font-display font-semibold">{v}</div>
            </div>
          ))}
        </div>
      )}

      {entries === null ? (
        <div className="flex items-center gap-2 text-[14px] text-muted py-10">
          <Loader2 size={15} className="animate-spin" /> Loading time…
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Clock size={40} strokeWidth={1.25} className="text-muted mb-5" />
          <div className="text-[17px] font-semibold mb-1.5">No time this week</div>
          <div className="text-[14px] text-muted">Add an entry, or start the timer on a task. Your time adds up here by day.</div>
        </div>
      ) : view === "entries" ? (
        <div className="border border-line rounded-2xl overflow-hidden bg-white">{visible.map((e) => row(e, true))}</div>
      ) : (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 7 }, (_, i) => {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + i);
            const day = localYmd(d);
            const list = visible.filter((e) => e.date === day);
            if (!list.length) return null;
            return (
              <div key={day}>
                <div className="flex items-center justify-between px-1 mb-2">
                  <span className="text-[13.5px] font-semibold">
                    {d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                    {day === localYmd(new Date()) && <span className="text-muted font-normal"> · Today</span>}
                  </span>
                  <span className="mono text-[13px] text-muted">{formatMinutes(list.reduce((n, e) => n + e.minutes, 0))}</span>
                </div>
                <div className="border border-line rounded-2xl overflow-hidden bg-white">{list.map((e) => row(e, false))}</div>
              </div>
            );
          })}
        </div>
      )}

      {(modalOpen || editing) && (
        <AddEntryModal
          entry={editing}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSaved={() => {
            setModalOpen(false);
            setEditing(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

function AddEntryModal({ entry, onClose, onSaved }: { entry?: Entry | null; onClose: () => void; onSaved: () => void }) {
  const { matters, tasks } = useWorkspaceData();
  const nowD = new Date();
  const endDefault = hm(nowD);
  const startDefault = fromMinutes(toMinutes(endDefault) - 60);
  const s0 = entry?.startedAt ? new Date(entry.startedAt) : null;
  const [date, setDate] = useState(entry?.date ?? localYmd(nowD));
  const [start, setStart] = useState(s0 ? hm(s0) : entry ? "09:00" : startDefault);
  const [end, setEnd] = useState(
    entry ? (entry.endedAt ? hm(new Date(entry.endedAt)) : fromMinutes(toMinutes(s0 ? hm(s0) : "09:00") + entry.minutes)) : endDefault
  );
  const [duration, setDuration] = useState(entry ? formatMinutes(entry.minutes) : "1h");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [matterId, setMatterId] = useState(entry?.matterId ?? "");
  const [taskId, setTaskId] = useState(entry?.taskId ?? "");
  const [billable, setBillable] = useState(entry?.billable ?? true);
  const [rate, setRate] = useState(entry?.rate != null ? String(entry.rate) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minutes = useMemo(() => {
    const m = toMinutes(end) - toMinutes(start);
    return m > 0 ? m : m + 1440; // past midnight
  }, [start, end]);

  const syncDuration = useCallback((s: string, e: string) => {
    let m = toMinutes(e) - toMinutes(s);
    if (m <= 0) m += 1440;
    setDuration(formatMinutes(m));
  }, []);

  const matter = matters.find((m) => m.id === matterId) ?? null;
  const openTasks = tasks.filter((t) => t.status !== "done" || t.id === taskId);

  async function save() {
    const m = parseDuration(duration) ?? minutes;
    if (!m || m < 1) return setError("Enter how long you worked.");
    setSaving(true);
    setError(null);
    try {
      const startedAt = new Date(`${date}T${start}`);
      const endedAt = new Date(startedAt.getTime() + m * 60000);
      const r = await fetch(entry ? `/api/time-entries/${entry.id}` : "/api/time-entries", {
        method: entry ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          minutes: m,
          description: description.trim() || tasks.find((t) => t.id === taskId)?.title || "",
          matterId: matterId || null,
          taskId: taskId || null,
          billable,
          rate: rate.trim() ? Number(rate) : matter?.hourlyRate ?? null,
          source: "manual",
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? "Couldn't save the entry.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  const field = "w-full border border-line rounded-xl px-3.5 py-2.5 text-[14px] bg-white outline-none focus:border-ink";
  const label = "text-[13px] font-medium text-muted mb-1.5 block";
  const parsed = parseDuration(duration);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-cream rounded-3xl w-full max-w-[520px] max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-[20px] font-semibold">{entry ? "Edit time entry" : "Add time entry"}</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="px-6 pb-4 flex flex-col gap-4">
          <div>
            <label className={label}>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Start</label>
              <input
                type="time"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  syncDuration(e.target.value, end);
                }}
                className={field}
              />
            </div>
            <div>
              <label className={label}>End</label>
              <input
                type="time"
                value={end}
                onChange={(e) => {
                  setEnd(e.target.value);
                  syncDuration(start, e.target.value);
                }}
                className={field}
              />
            </div>
          </div>
          <div>
            <label className={label}>Duration</label>
            <input
              value={duration}
              onChange={(e) => {
                setDuration(e.target.value);
                const m = parseDuration(e.target.value);
                if (m && m > 0 && m <= 1440) setEnd(fromMinutes(toMinutes(start) + m));
              }}
              placeholder="e.g. 1h 30m, 90m or 1.5"
              className={field}
            />
          </div>
          <div>
            <label className={label}>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What did you work on?" rows={3} className={`${field} resize-none`} />
          </div>
          <div>
            <label className={label}>Matter</label>
            <SelectBox label="Matter" value={matterId} onChange={setMatterId}>
              <option value="">No matter</option>
              {matters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </SelectBox>
            {matters.length === 0 && <p className="text-[12px] text-muted mt-1">No matters yet. Create one in Matters to bill time to it.</p>}
          </div>
          <div>
            <label className={label}>Task</label>
            <SelectBox label="Task" value={taskId} onChange={setTaskId}>
              <option value="">No task</option>
              {openTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </SelectBox>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-medium">Billable</span>
            <button onClick={() => setBillable((b) => !b)} aria-pressed={billable} className={`w-10 h-6 rounded-full relative ${billable ? "bg-dark" : "bg-line"}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${billable ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </div>
          {billable && (
            <div>
              <label className={label}>Hourly rate</label>
              <div className={`${field} flex items-center gap-1`}>
                <span className="text-muted">$</span>
                <input
                  value={rate}
                  onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))}
                  inputMode="decimal"
                  placeholder={matter?.hourlyRate ? String(matter.hourlyRate) : "0"}
                  className="flex-1 bg-transparent outline-none"
                />
                <span className="text-muted">/h</span>
              </div>
              <p className="text-[12px] text-muted mt-1">
                {matter?.hourlyRate ? `Leave empty to use this matter's rate ($${matter.hourlyRate}/h).` : "Leave empty for no rate."}
              </p>
            </div>
          )}
          <div className="text-[13.5px]">
            Total: <span className="font-semibold">{parsed ? formatMinutes(parsed) : "—"}</span>
            {billable && parsed && (rate.trim() || matter?.hourlyRate) ? (
              <span className="text-muted"> · {money(((rate.trim() ? Number(rate) : matter?.hourlyRate ?? 0) * parsed) / 60)}</span>
            ) : null}
          </div>
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-line">
          <button onClick={onClose} className="px-4 py-2 rounded-full text-[13.5px] font-medium text-muted hover:text-ink">
            Cancel
          </button>
          <button onClick={save} disabled={saving} className="bg-btn text-ink px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-btn-hover disabled:opacity-50 flex items-center gap-1.5">
            {saving && <Loader2 size={14} className="animate-spin" />} {entry ? "Save changes" : "Add entry"}
          </button>
        </div>
      </div>
    </div>
  );
}
