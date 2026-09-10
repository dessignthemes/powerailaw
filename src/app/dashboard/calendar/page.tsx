"use client";

import { useMemo, useState, Fragment } from "react";
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
} from "lucide-react";
import NewEventModal, { CalendarEvent } from "@/components/NewEventModal";
import { useIntegrationsModal } from "@/context/IntegrationsModalContext";

const weekDayShort = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hours = Array.from({ length: 15 }, (_, i) => i + 8); // 08:00 - 22:00

type ViewMode = "Month" | "Week" | "Day";

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
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
  const { openIntegrations } = useIntegrationsModal();

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
  const nowOffsetPx = ((nowMinutes - gridTopHour * 60) / 60) * 56; // 56px per hour row

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
            onClick={goToday}
            className="w-9 h-9 rounded-full bg-card-alt hover:bg-line/60 transition-colors flex items-center justify-center"
          >
            <RotateCw size={15} strokeWidth={1.75} />
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

      <div className="bg-card-alt border border-line rounded-xl px-5 py-3 flex items-center justify-between mb-6 flex-wrap gap-3">
        <span className="text-[13.5px] text-muted">
          Sync from Outlook Calendar to see your events here.
        </span>
        <button onClick={openIntegrations} className="text-[13.5px] font-medium text-ink underline">
          Connect a calendar
        </button>
      </div>

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
              const dayEvents = events.filter((e) => e.date === iso);
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
                        className="text-[11px] font-medium bg-white border border-line rounded-md px-1.5 py-0.5 truncate"
                      >
                        {e.start} {e.title}
                      </div>
                    ))}
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
          <div className="relative max-h-[640px] overflow-y-auto">
            <div className="grid grid-cols-[60px_repeat(7,1fr)]">
              {hours.map((h) => (
                <Fragment key={h}>
                  <div
                    className="text-[11px] text-muted text-right pr-2 -translate-y-2"
                    style={{ height: 56 }}
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
                        style={{ height: 56 }}
                      />
                    );
                  })}
                </Fragment>
              ))}
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
          <div className="relative max-h-[640px] overflow-y-auto">
            {hours.map((h) => (
              <button
                key={h}
                onClick={() => setModalDate(toISODate(cursor))}
                className="w-full flex border-t border-line hover:bg-card-alt/50 transition-colors text-left"
                style={{ height: 56 }}
              >
                <span className="text-[11px] text-muted w-14 text-right pr-2 -translate-y-2 flex-shrink-0">
                  {String(h).padStart(2, "0")}:00
                </span>
              </button>
            ))}
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
