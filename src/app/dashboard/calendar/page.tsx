"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Sun,
  Search,
  SlidersHorizontal,
  RotateCw,
  Plus,
  Check,
  ChevronDown,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import NewEventModal, { CalendarEvent } from "@/components/NewEventModal";

const weekDayShort = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hours = Array.from({ length: 24 }, (_, i) => i); // full day; the grid scrolls to the morning
const HOUR_PX = 56;

type ViewMode = "Month" | "Week" | "Day";

// Local calendar date (YYYY-MM-DD). toISOString() would use UTC and put
// evening dates on the next day in US time zones.
function toISODate(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

type Provider = "google" | "microsoft";
type Source = { provider: Provider; email: string | null; status: "ok" | "reconnect" | "missing_scope" | "error"; message?: string };
type Synced = { id: string; provider: Provider; title: string; start: string; end: string; allDay: boolean; location: string | null; link: string | null };

// One shape for synced and locally added events, in local time.
type Shown = { id: string; title: string; allDay: boolean; start: Date; end: Date; link: string | null; location: string | null; source: Provider | "local" };

const providerName: Record<Provider, string> = { google: "Google Calendar", microsoft: "Outlook" };
const chipClass: Record<Shown["source"], string> = {
  google: "bg-[#E8F0FE] border-[#C5D6F6] text-[#1F3A93]",
  microsoft: "bg-[#E3F2F3] border-[#BFDCDF] text-[#155E63]",
  local: "bg-white border-line text-ink",
};

function parseAllDay(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toShown(e: Synced): Shown {
  return {
    id: e.id,
    title: e.title,
    allDay: e.allDay,
    start: e.allDay ? parseAllDay(e.start) : new Date(e.start),
    end: e.allDay ? parseAllDay(e.end) : new Date(e.end),
    link: e.link,
    location: e.location,
    source: e.provider,
  };
}

function localToShown(e: CalendarEvent): Shown {
  const at = (hm: string) => {
    const [h, m] = (hm || "09:00").split(":").map(Number);
    const d = parseAllDay(e.date);
    d.setHours(h || 0, m || 0, 0, 0);
    return d;
  };
  const start = at(e.start);
  let end = at(e.end);
  if (end <= start) end = new Date(start.getTime() + 30 * 60000);
  return { id: e.id, title: e.title, allDay: false, start, end, link: null, location: null, source: "local" };
}

function eventsOnDay(list: Shown[], day: Date) {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1);
  return list
    .filter((e) => e.start < dayEnd && (e.end > dayStart || (e.end.getTime() === e.start.getTime() && e.start >= dayStart)))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime());
}

function timeLabel(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: d.getMinutes() ? "2-digit" : undefined }).replace(" ", "").toLowerCase();
}

// Side-by-side columns for overlapping timed events within one day.
function layoutDay(list: Shown[], day: Date) {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const timed = list.filter((e) => !e.allDay).map((e) => {
    const s = Math.max(e.start.getTime(), dayStart);
    const en = Math.min(e.end.getTime(), dayStart + 86400000);
    return { e, s, en: Math.max(en, s + 20 * 60000) };
  });
  timed.sort((a, b) => a.s - b.s);
  // Split into clusters of mutually overlapping events; share width only within a cluster.
  const out: { e: Shown; top: number; height: number; left: number; width: number }[] = [];
  let i = 0;
  while (i < timed.length) {
    let clusterEnd = timed[i].en;
    let j = i + 1;
    while (j < timed.length && timed[j].s < clusterEnd) {
      clusterEnd = Math.max(clusterEnd, timed[j].en);
      j++;
    }
    const cluster = timed.slice(i, j);
    const laneEnds: number[] = [];
    const placed = cluster.map((t) => {
      let lane = laneEnds.findIndex((end) => end <= t.s);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(t.en);
      } else laneEnds[lane] = t.en;
      return { ...t, lane };
    });
    const lanes = laneEnds.length;
    for (const p of placed) {
      out.push({
        e: p.e,
        top: ((p.s - dayStart) / 3600000) * HOUR_PX,
        height: Math.max(20, ((p.en - p.s) / 3600000) * HOUR_PX - 2),
        left: (p.lane / lanes) * 100,
        width: 100 / lanes,
      });
    }
    i = j;
  }
  return out;
}

function getWeekStart(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startOffset);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  return days;
}

export default function CalendarPage() {
  const today = new Date();
  const [view, setView] = useState<ViewMode>("Month");
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [synced, setSynced] = useState<Synced[]>([]);
  const [sources, setSources] = useState<Source[] | null>(null);
  const [syncing, setSyncing] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const weekScroll = useRef<HTMLDivElement>(null);
  const dayScroll = useRef<HTMLDivElement>(null);

  const todayISO = toISODate(today);

  const monthDays = useMemo(
    () => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()),
    [cursor]
  );

  const weekStart = useMemo(() => getWeekStart(cursor), [cursor]);
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  // Visible date range for the current view.
  const range = useMemo(() => {
    if (view === "Month") {
      const from = monthDays[0];
      const to = new Date(monthDays[41]);
      to.setDate(to.getDate() + 1);
      return { from, to };
    }
    if (view === "Week") {
      const to = new Date(weekStart);
      to.setDate(to.getDate() + 7);
      return { from: weekStart, to };
    }
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    return { from, to: new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1) };
  }, [view, monthDays, weekStart, cursor]);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() });
    fetch(`/api/calendar/events?${qs}`)
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d?.error ?? "Couldn't load your calendar.");
        return d as { events: Synced[]; sources: Source[] };
      })
      .then((d) => {
        if (cancelled) return;
        setSynced(d.events);
        setSources(d.sources);
        setSyncError(null);
      })
      .catch((e: Error) => !cancelled && setSyncError(e.message))
      .finally(() => !cancelled && setSyncing(false));
    return () => {
      cancelled = true;
    };
  }, [range, refreshKey]);

  const refresh = useCallback(() => {
    setSyncing(true);
    setRefreshKey((k) => k + 1);
  }, []);

  const shown = useMemo(() => [...synced.map(toShown), ...events.map(localToShown)], [synced, events]);

  // Start the hour grid at 7am instead of midnight.
  useEffect(() => {
    const el = view === "Week" ? weekScroll.current : view === "Day" ? dayScroll.current : null;
    if (el) el.scrollTop = 7 * HOUR_PX;
  }, [view]);

  function openEvent(e: Shown, ev: React.MouseEvent) {
    ev.stopPropagation();
    if (e.link) window.open(e.link, "_blank", "noopener");
  }

  const headerLabel =
    view === "Month"
      ? cursor.toLocaleDateString("en-US", { month: "short", year: "numeric" })
      : view === "Week"
      ? `Week of ${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
      : cursor.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });

  function shift(delta: number) {
    if (view === "Month") {
      setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
    } else if (view === "Week") {
      setCursor((c) => {
        const d = new Date(c);
        d.setDate(d.getDate() + delta * 7);
        return d;
      });
    } else {
      setCursor((c) => {
        const d = new Date(c);
        d.setDate(d.getDate() + delta);
        return d;
      });
    }
  }

  function goToday() {
    setCursor(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  }

  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const gridTopHour = hours[0];
  const nowOffsetPx = ((nowMinutes - gridTopHour * 60) / 60) * HOUR_PX;

  const viewIcons: Record<ViewMode, typeof CalendarIcon> = {
    Month: CalendarIcon,
    Week: CalendarIcon,
    Day: Sun,
  };
  const ViewIcon = viewIcons[view];

  return (
    <div className="px-10 py-10">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-card-alt rounded-full px-2 py-1.5">
            <button
              onClick={() => shift(-1)}
              className="w-6 h-6 flex items-center justify-center text-muted hover:text-ink transition-colors"
            >
              <ChevronLeft size={15} strokeWidth={1.75} />
            </button>
            <span className="text-[13.5px] font-medium px-1">{headerLabel}</span>
            <button
              onClick={() => shift(1)}
              className="w-6 h-6 flex items-center justify-center text-muted hover:text-ink transition-colors"
            >
              <ChevronRight size={15} strokeWidth={1.75} />
            </button>
          </div>

          <div className="relative">
            <button
              onClick={() => setViewMenuOpen((o) => !o)}
              className="flex items-center gap-2 bg-card-alt hover:bg-line/60 transition-colors rounded-full px-3.5 py-2 text-[13.5px] font-medium"
            >
              <ViewIcon size={14} strokeWidth={1.75} /> {view}
              <ChevronDown size={12} strokeWidth={2} className="text-muted" />
            </button>
            {viewMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setViewMenuOpen(false)} />
                <div className="absolute left-0 top-[calc(100%+8px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 w-[160px]">
                  {(["Month", "Week", "Day"] as ViewMode[]).map((v) => {
                    const Icon = viewIcons[v];
                    return (
                      <button
                        key={v}
                        onClick={() => {
                          setView(v);
                          setViewMenuOpen(false);
                        }}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          <Icon size={15} strokeWidth={1.75} /> {v}
                        </span>
                        {v === view && <Check size={14} strokeWidth={2} />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="w-9 h-9 rounded-full bg-card-alt hover:bg-line/60 transition-colors flex items-center justify-center">
            <Search size={15} strokeWidth={1.75} />
          </button>
          <button className="w-9 h-9 rounded-full bg-card-alt hover:bg-line/60 transition-colors flex items-center justify-center">
            <SlidersHorizontal size={15} strokeWidth={1.75} />
          </button>
          <button
            onClick={refresh}
            title="Refresh calendar"
            aria-label="Refresh calendar"
            className="w-9 h-9 rounded-full bg-card-alt hover:bg-line/60 transition-colors flex items-center justify-center"
          >
            <RotateCw size={15} strokeWidth={1.75} className={syncing ? "animate-spin" : ""} />
          </button>
          <button
            onClick={goToday}
            className="bg-card-alt px-3.5 py-2 rounded-full text-[13.5px] font-medium hover:bg-line/60 transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => setModalDate(toISODate(cursor))}
            className="bg-dark text-white px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 hover:bg-dark2 transition-colors"
          >
            <Plus size={14} strokeWidth={2} /> Add
          </button>
        </div>
      </div>

      {(() => {
        const ok = (sources ?? []).filter((x) => x.status === "ok");
        const bad = (sources ?? []).filter((x) => x.status !== "ok");
        const connect = (p: Provider) => `/connect?provider=${p}&next=/dashboard/calendar`;
        if (syncError)
          return (
            <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 mb-6 text-[13.5px] text-red-700 flex items-center justify-between gap-3 flex-wrap">
              <span>{syncError}</span>
              <button onClick={refresh} className="underline font-medium">Try again</button>
            </div>
          );
        if (sources === null)
          return (
            <div className="bg-card-alt border border-line rounded-xl px-5 py-3 mb-6 text-[13.5px] text-muted flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Loading your calendar…
            </div>
          );
        return (
          <div className="flex flex-col gap-2 mb-6">
            {sources.length === 0 && (
              <div className="bg-card-alt border border-line rounded-xl px-5 py-3 flex items-center justify-between flex-wrap gap-3">
                <span className="text-[13.5px] text-muted">Sync from Google or Outlook Calendar to see your events here.</span>
                <span className="flex items-center gap-4 text-[13.5px] font-medium">
                  <Link href={connect("google")} className="underline">Connect Google Calendar</Link>
                  <Link href={connect("microsoft")} className="underline">Connect Outlook</Link>
                </span>
              </div>
            )}
            {bad.map((b) => (
              <div key={b.provider} className="rounded-xl border border-[#E6CF8F] bg-[#F5E3B3]/50 px-5 py-3 flex items-center justify-between flex-wrap gap-3 text-[13.5px]">
                <span className="flex items-center gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0" />
                  {providerName[b.provider]}{b.email ? ` (${b.email})` : ""}: {b.message ?? "needs attention"}
                </span>
                <Link href={connect(b.provider)} className="bg-dark text-white px-3.5 py-1.5 rounded-full text-[12.5px] font-medium hover:bg-dark2">
                  Reconnect
                </Link>
              </div>
            ))}
            {ok.length > 0 && (
              <div className="text-[12.5px] text-muted flex items-center gap-2 flex-wrap px-1">
                <Check size={13} className="text-[#2F5E2A]" />
                Synced with {ok.map((x) => `${providerName[x.provider]}${x.email ? ` (${x.email})` : ""}`).join(" and ")}. Click an event to open it there.
                {!ok.some((x) => x.provider === "google") && !bad.some((x) => x.provider === "google") && (
                  <Link href={connect("google")} className="underline">Add Google Calendar</Link>
                )}
                {!ok.some((x) => x.provider === "microsoft") && !bad.some((x) => x.provider === "microsoft") && (
                  <Link href={connect("microsoft")} className="underline">Add Outlook</Link>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {view === "Month" && (
        <div className="border border-line rounded-2xl overflow-hidden">
          <div className="grid grid-cols-7 bg-card-alt border-b border-line">
            {weekDayShort.map((d) => (
              <div key={d} className="text-[12.5px] font-medium text-muted px-3 py-2.5 text-center">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map((d, i) => {
              const iso = toISODate(d);
              const inMonth = d.getMonth() === cursor.getMonth();
              const isToday = iso === todayISO;
              const dayEvents = eventsOnDay(shown, d);
              return (
                <button
                  key={i}
                  onClick={() => setModalDate(iso)}
                  className={`min-h-[140px] border-r border-b border-line px-2.5 py-2 text-left hover:bg-card-alt/60 transition-colors ${
                    !inMonth ? "text-muted/40" : ""
                  } ${(i + 1) % 7 === 0 ? "border-r-0" : ""}`}
                >
                  <span
                    className={`inline-flex items-center justify-center text-[13px] w-6 h-6 rounded-full ${
                      isToday ? "bg-red-500 text-white font-semibold" : ""
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  <div className="flex flex-col gap-1 mt-1.5">
                    {dayEvents.slice(0, 3).map((e) => (
                      <div
                        key={e.id}
                        role={e.link ? "link" : undefined}
                        onClick={(ev) => openEvent(e, ev)}
                        title={`${e.title}${e.location ? ` · ${e.location}` : ""}`}
                        className={`text-[11px] font-medium border rounded-md px-1.5 py-0.5 truncate ${chipClass[e.source]} ${e.link ? "cursor-pointer hover:brightness-95" : ""}`}
                      >
                        {e.allDay ? "" : `${timeLabel(e.start)} `}
                        {e.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setCursor(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
                          setView("Day");
                        }}
                        className="text-[11px] text-muted hover:text-ink px-1.5 cursor-pointer"
                      >
                        +{dayEvents.length - 3} more
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {view === "Week" && (
        <div className="border border-line rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[60px_repeat(7,1fr)] bg-card-alt border-b border-line">
            <div />
            {weekDays.map((d) => {
              const iso = toISODate(d);
              const isToday = iso === todayISO;
              return (
                <div
                  key={iso}
                  className={`text-[12.5px] font-medium px-3 py-2.5 text-center ${
                    isToday ? "text-red-500 font-semibold" : "text-muted"
                  }`}
                >
                  {d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}{" "}
                  {d.getDate()}
                </div>
              );
            })}
          </div>
          {weekDays.some((d) => eventsOnDay(shown, d).some((e) => e.allDay)) && (
            <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-line bg-cream">
              <div className="text-[10.5px] text-muted text-right pr-2 py-1.5">all-day</div>
              {weekDays.map((d) => (
                <div key={toISODate(d)} className="border-l border-line p-1 flex flex-col gap-1 min-w-0">
                  {eventsOnDay(shown, d)
                    .filter((e) => e.allDay)
                    .map((e) => (
                      <div key={e.id} onClick={(ev) => openEvent(e, ev)} title={e.title} className={`text-[11px] font-medium border rounded-md px-1.5 py-0.5 truncate ${chipClass[e.source]} ${e.link ? "cursor-pointer" : ""}`}>
                        {e.title}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          )}
          <div ref={weekScroll} className="relative max-h-[640px] overflow-y-auto">
            <div className="grid grid-cols-[60px_repeat(7,1fr)]">
              {hours.map((h) => (
                <Fragment key={h}>
                  <div
                    className="text-[11px] text-muted text-right pr-2 -translate-y-2"
                    style={{ height: HOUR_PX }}
                  >
                    {String(h).padStart(2, "0")}:00
                  </div>
                  {weekDays.map((d) => {
                    const iso = toISODate(d);
                    return (
                      <button
                        key={`${iso}-${h}`}
                        onClick={() => setModalDate(iso)}
                        className="border-t border-l border-line hover:bg-card-alt/50 transition-colors"
                        style={{ height: HOUR_PX }}
                      />
                    );
                  })}
                </Fragment>
              ))}
            </div>
            {/* Timed events */}
            <div className="absolute top-0 bottom-0 left-[60px] right-0 pointer-events-none">
              {weekDays.map((d, col) =>
                layoutDay(eventsOnDay(shown, d), d).map(({ e, top, height, left, width }) => (
                  <div
                    key={`${e.id}-${col}`}
                    onClick={(ev) => openEvent(e, ev)}
                    title={`${e.title}${e.location ? ` · ${e.location}` : ""}`}
                    className={`absolute pointer-events-auto border rounded-md px-1.5 py-0.5 overflow-hidden text-[11px] leading-tight ${chipClass[e.source]} ${e.link ? "cursor-pointer hover:brightness-95" : ""}`}
                    style={{ top, height, left: `calc(${(col / 7) * 100}% + ${(left / 100) * (100 / 7)}% + 2px)`, width: `calc(${(width / 100) * (100 / 7)}% - 4px)` }}
                  >
                    <div className="font-medium truncate">{e.title}</div>
                    {height > 32 && <div className="opacity-75 truncate">{timeLabel(e.start)}–{timeLabel(e.end)}</div>}
                  </div>
                ))
              )}
            </div>
            {weekDays.some((d) => toISODate(d) === todayISO) && nowOffsetPx >= 0 && (
              <div
                className="absolute left-[60px] right-0 flex items-center pointer-events-none"
                style={{ top: nowOffsetPx }}
              >
                <div
                  className="absolute w-2 h-2 rounded-full bg-red-500 -translate-x-1"
                  style={{
                    left: `calc(${(weekDays.findIndex((d) => toISODate(d) === todayISO) / 7) * 100}% )`,
                  }}
                />
                <div className="w-full border-t border-red-500" />
              </div>
            )}
          </div>
        </div>
      )}

      {view === "Day" && (
        <div className="border border-line rounded-2xl overflow-hidden">
          <div className="bg-card-alt border-b border-line px-4 py-2.5 text-[13px] font-semibold text-center">
            {cursor.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </div>
          {eventsOnDay(shown, cursor).some((e) => e.allDay) && (
            <div className="border-b border-line bg-cream px-3 py-1.5 flex flex-wrap gap-1.5 items-center">
              <span className="text-[10.5px] text-muted mr-1">all-day</span>
              {eventsOnDay(shown, cursor)
                .filter((e) => e.allDay)
                .map((e) => (
                  <div key={e.id} onClick={(ev) => openEvent(e, ev)} className={`text-[11.5px] font-medium border rounded-md px-2 py-0.5 ${chipClass[e.source]} ${e.link ? "cursor-pointer" : ""}`}>
                    {e.title}
                  </div>
                ))}
            </div>
          )}
          <div ref={dayScroll} className="relative max-h-[640px] overflow-y-auto">
            {hours.map((h) => (
              <button
                key={h}
                onClick={() => setModalDate(toISODate(cursor))}
                className="w-full flex border-t border-line hover:bg-card-alt/50 transition-colors text-left"
                style={{ height: HOUR_PX }}
              >
                <span className="text-[11px] text-muted w-14 text-right pr-2 -translate-y-2 flex-shrink-0">
                  {String(h).padStart(2, "0")}:00
                </span>
              </button>
            ))}
            <div className="absolute top-0 bottom-0 left-14 right-2 pointer-events-none">
              {layoutDay(eventsOnDay(shown, cursor), cursor).map(({ e, top, height, left, width }) => (
                <div
                  key={e.id}
                  onClick={(ev) => openEvent(e, ev)}
                  className={`absolute pointer-events-auto border rounded-md px-2 py-1 overflow-hidden text-[12px] leading-tight ${chipClass[e.source]} ${e.link ? "cursor-pointer hover:brightness-95" : ""}`}
                  style={{ top, height, left: `calc(${left}% + 2px)`, width: `calc(${width}% - 4px)` }}
                >
                  <div className="font-medium truncate">{e.title}</div>
                  {height > 32 && (
                    <div className="opacity-75 truncate">
                      {timeLabel(e.start)}–{timeLabel(e.end)}
                      {e.location ? ` · ${e.location}` : ""}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {toISODate(cursor) === todayISO && (
              <div
                className="absolute left-14 right-0 border-t border-red-500 pointer-events-none"
                style={{ top: nowOffsetPx }}
              >
                <div className="w-2 h-2 rounded-full bg-red-500 -translate-x-1 -translate-y-1" />
              </div>
            )}
          </div>
        </div>
      )}

      {modalDate && (
        <NewEventModal
          initialDate={modalDate}
          onClose={() => setModalDate(null)}
          onCreate={(event) => {
            setEvents((evs) => [...evs, event]);
            setModalDate(null);
          }}
        />
      )}
    </div>
  );
}
