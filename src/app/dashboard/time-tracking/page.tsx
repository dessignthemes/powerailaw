"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  List,
  SlidersHorizontal,
  Plus,
  X,
  Clock,
  Check,
  ChevronDown,
} from "lucide-react";

type TimeEntry = {
  id: string;
  date: string;
  start: string;
  end: string;
  duration: string;
  description: string;
  matter: string;
  billable: boolean;
};

function getWeekStart(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatWeekRange(weekStart: Date) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const startMonth = weekStart.toLocaleDateString("en-US", { month: "short" });
  const endMonth = weekEnd.toLocaleDateString("en-US", { month: "short" });
  const year = weekEnd.getFullYear();
  if (startMonth === endMonth) {
    return `${startMonth} ${weekStart.getDate()} – ${weekEnd.getDate()}, ${year}`;
  }
  return `${startMonth} ${weekStart.getDate()} – ${endMonth} ${weekEnd.getDate()}, ${year}`;
}

export default function TimeTrackingPage() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [view, setView] = useState<"timesheet" | "entries">("timesheet");
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [billable, setBillable] = useState<"all" | "billable" | "nonbillable">("all");
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [entries, setEntries] = useState<TimeEntry[]>([]);

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    start: "13:36",
    end: "14:36",
    duration: "1h",
    description: "",
    matter: "No matter",
    billable: true,
    rate: "",
  });

  const weekLabel = useMemo(() => formatWeekRange(weekStart), [weekStart]);

  const visibleEntries = entries.filter((e) => {
    if (billable === "billable") return e.billable;
    if (billable === "nonbillable") return !e.billable;
    return true;
  });

  function shiftWeek(days: number) {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + days);
    setWeekStart(next);
  }

  function addEntry() {
    setEntries((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        date: form.date,
        start: form.start,
        end: form.end,
        duration: form.duration,
        description: form.description || "Untitled entry",
        matter: form.matter,
        billable: form.billable,
      },
    ]);
    setModalOpen(false);
    setForm((f) => ({ ...f, description: "" }));
  }

  return (
    <div className="px-10 py-10">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-card-alt rounded-full px-2 py-1.5">
            <button
              onClick={() => shiftWeek(-7)}
              className="w-6 h-6 flex items-center justify-center text-muted hover:text-ink transition-colors"
            >
              <ChevronLeft size={15} strokeWidth={1.75} />
            </button>
            <span className="text-[13.5px] font-medium px-1">{weekLabel}</span>
            <button
              onClick={() => shiftWeek(7)}
              className="w-6 h-6 flex items-center justify-center text-muted hover:text-ink transition-colors"
            >
              <ChevronRight size={15} strokeWidth={1.75} />
            </button>
          </div>

          <div className="relative">
            <button
              onClick={() => setViewMenuOpen((o) => !o)}
              className="flex items-center gap-2 bg-card-alt hover:bg-line/60 transition-colors px-3.5 py-2 rounded-full text-[13.5px] font-medium"
            >
              {view === "timesheet" ? (
                <Calendar size={14} strokeWidth={1.75} />
              ) : (
                <List size={14} strokeWidth={1.75} />
              )}
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
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors"
                    >
                      <span className="flex items-center gap-2.5">
                        {v === "timesheet" ? (
                          <Calendar size={15} strokeWidth={1.75} />
                        ) : (
                          <List size={15} strokeWidth={1.75} />
                        )}
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
              className="w-9 h-9 rounded-full bg-card-alt hover:bg-line/60 transition-colors flex items-center justify-center"
            >
              <SlidersHorizontal size={15} strokeWidth={1.75} />
            </button>
            {filterOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />
                <div className="absolute right-0 top-[calc(100%+8px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-4 w-[280px]">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[13.5px] font-medium text-muted">Billable</span>
                    <div className="flex bg-card-alt rounded-full p-1">
                      {(["all", "billable", "nonbillable"] as const).map((b) => (
                        <button
                          key={b}
                          onClick={() => setBillable(b)}
                          className={`px-2.5 py-1 rounded-full text-[12.5px] font-medium transition-colors ${
                            billable === b ? "bg-white shadow-sm" : "text-muted"
                          }`}
                        >
                          {b === "all" ? "All" : b === "billable" ? "Billable" : "Non-billable"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-line pt-4 flex items-center justify-between">
                    <span className="text-[13.5px] font-medium">Show all users in org</span>
                    <button
                      onClick={() => setShowAllUsers((s) => !s)}
                      className={`w-10 h-6 rounded-full transition-colors relative ${
                        showAllUsers ? "bg-dark" : "bg-line"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                          showAllUsers ? "left-[18px]" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="bg-card-alt px-3.5 py-2 rounded-full text-[13.5px] font-medium">
            This week
          </div>

          <button
            onClick={() => setModalOpen(true)}
            className="bg-dark text-white px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 hover:bg-dark2 transition-colors"
          >
            <Plus size={14} strokeWidth={2} /> Add entry
          </button>
        </div>
      </div>

      {visibleEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Clock size={40} strokeWidth={1.25} className="text-muted mb-5" />
          <div className="text-[17px] font-semibold mb-1.5">No time this week</div>
          <div className="text-[14px] text-muted">Logged entries will roll up here by matter.</div>
        </div>
      ) : (
        <div className="border border-line rounded-2xl overflow-hidden">
          {visibleEntries.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between px-5 py-4 border-b border-line last:border-b-0"
            >
              <div>
                <div className="text-[14.5px] font-medium">{e.description}</div>
                <div className="text-[12.5px] text-muted mt-0.5">
                  {e.matter} · {e.start} – {e.end}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {e.billable && (
                  <span className="text-[11.5px] bg-card-alt px-2 py-1 rounded-full font-medium">
                    Billable
                  </span>
                )}
                <span className="mono text-[13.5px] font-medium">{e.duration}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="bg-cream rounded-3xl w-full max-w-[440px] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-7 pt-6 pb-5">
              <h3 className="text-[20px] font-semibold">Add time entry</h3>
              <button onClick={() => setModalOpen(false)} className="text-muted hover:text-ink">
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>

            <div className="px-7 flex flex-col gap-5 pb-6">
              <div>
                <label className="text-[13px] font-medium text-muted mb-1.5 block">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full border border-line rounded-xl px-3.5 py-2.5 text-[14px] bg-white outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[13px] font-medium text-muted mb-1.5 block">Start</label>
                  <input
                    type="time"
                    value={form.start}
                    onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
                    className="w-full border border-line rounded-xl px-3.5 py-2.5 text-[14px] bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-[13px] font-medium text-muted mb-1.5 block">End</label>
                  <input
                    type="time"
                    value={form.end}
                    onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
                    className="w-full border border-line rounded-xl px-3.5 py-2.5 text-[14px] bg-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[13px] font-medium text-muted mb-1.5 block">Duration</label>
                <input
                  value={form.duration}
                  onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
                  className="w-full border border-line rounded-xl px-3.5 py-2.5 text-[14px] bg-white outline-none"
                />
              </div>

              <div>
                <label className="text-[13px] font-medium text-muted mb-1.5 block">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What did you work on?"
                  rows={4}
                  className="w-full border border-line rounded-xl px-3.5 py-2.5 text-[14px] bg-white outline-none resize-none placeholder:text-muted"
                />
              </div>

              <div>
                <label className="text-[13px] font-medium text-muted mb-1.5 block">Matter</label>
                <div className="w-full border border-line rounded-xl px-3.5 py-2.5 text-[14px] bg-white flex items-center justify-between text-muted">
                  {form.matter}
                  <ChevronDown size={14} strokeWidth={1.75} />
                </div>
              </div>

              <div>
                <label className="text-[13px] font-medium text-muted mb-1.5 block">Task</label>
                <div className="w-full border border-line rounded-xl px-3.5 py-2.5 text-[14px] bg-white flex items-center justify-between text-muted/60">
                  Pick a matter first
                  <ChevronDown size={14} strokeWidth={1.75} />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium">Billable</span>
                <button
                  onClick={() => setForm((f) => ({ ...f, billable: !f.billable }))}
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    form.billable ? "bg-dark" : "bg-line"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                      form.billable ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              {form.billable && (
                <div>
                  <label className="text-[13px] font-medium text-muted mb-1.5 block">
                    Hourly rate
                  </label>
                  <div className="flex items-center border border-line rounded-xl px-3.5 py-2.5 bg-white">
                    <span className="text-muted text-[14px] mr-1">$</span>
                    <input
                      value={form.rate}
                      onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
                      placeholder="0"
                      className="flex-1 outline-none text-[14px] bg-transparent"
                    />
                    <span className="text-muted text-[13px]">/h</span>
                  </div>
                  <div className="text-[12px] text-muted mt-1.5">
                    Leave empty to use the default rate.
                  </div>
                </div>
              )}

              <div className="text-[13.5px] text-muted">
                Total: <span className="font-semibold text-ink">{form.duration}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-7 py-5 border-t border-line">
              <button
                onClick={() => setModalOpen(false)}
                className="text-[14px] font-medium text-muted hover:text-ink transition-colors px-2"
              >
                Cancel
              </button>
              <button
                onClick={addEntry}
                className="bg-dark text-white px-5 py-2.5 rounded-full text-[14px] font-medium hover:bg-dark2 transition-colors"
              >
                Add entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
