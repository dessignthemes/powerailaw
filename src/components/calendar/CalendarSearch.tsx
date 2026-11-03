"use client";

import ClickAway from "@/components/ClickAway";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Loader2, MapPin, ChevronDown, Check, Users } from "lucide-react";

export type SearchHit = {
  id: string;
  provider: "google" | "microsoft";
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  link: string | null;
  private?: boolean;
  ownerId?: string;
};
type Person = { id: string; name: string; connected: boolean; me: boolean };
type Colour = { bg: string; bd: string; tx: string };

function startOf(e: SearchHit) {
  if (!e.allDay) return new Date(e.start);
  const [y, m, d] = e.start.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function whenLabel(e: SearchHit) {
  const d = startOf(e);
  const date = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  if (e.allDay) return `${date} · All day`;
  const t = d.toLocaleTimeString("en-US", { hour: "numeric", minute: d.getMinutes() ? "2-digit" : undefined }).replace(" ", "").toLowerCase();
  return `${date} · ${t}`;
}

// Search button on the Calendar page: opens a search box that finds events by
// words in the title or location, in your calendar, a colleague's, or everyone's.
export default function CalendarSearch({
  members,
  colorOf,
  onPick,
}: {
  members: Person[];
  colorOf: (ownerId?: string) => Colour;
  onPick: (e: SearchHit) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState(""); // "" = all calendars
  const [ownerOpen, setOwnerOpen] = useState(false);
  // The latest answer, tagged with the search it answers (so a stale one isn't shown).
  const [result, setResult] = useState<{ key: string; hits: SearchHit[] | null; error: string | null; skipped: string[]; more: boolean } | null>(null);
  const [showResults, setShowResults] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const query = q.trim();
  const key = query.length >= 2 ? `${owner}|${query}` : "";
  const current = result && result.key === key ? result : null;
  const loading = !!key && !current;
  const hits = current?.hits ?? null;
  const error = current?.error ?? null;
  const skipped = current?.skipped ?? [];
  const more = !!current?.more;

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ q: query });
      if (owner) qs.set("owner", owner);
      fetch(`/api/calendar/search?${qs}`, { signal: ctrl.signal })
        .then(async (res) => {
          const d = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(d?.error ?? "Search didn't work. Please try again.");
          return d as { events: SearchHit[]; skipped?: string[]; more?: boolean };
        })
        .then((d) => {
          setResult({ key, hits: d.events, error: null, skipped: d.skipped ?? [], more: !!d.more });
          setShowResults(true);
        })
        .catch((e: Error) => {
          if (e.name === "AbortError") return;
          setResult({ key, hits: null, error: e.message, skipped: [], more: false });
          setShowResults(true);
        });
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [key, query, owner]);

  // Upcoming first (soonest at the top), then past (most recent first).
  const groups = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const list = hits ?? [];
    const upcoming = list.filter((e) => startOf(e) >= todayStart);
    const past = list.filter((e) => startOf(e) < todayStart).reverse();
    return { upcoming, past };
  }, [hits]);

  function close() {
    setOpen(false);
    setOwnerOpen(false);
    setShowResults(false);
    setQ("");
    setResult(null);
  }

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        title="Search calendars"
        aria-label="Search calendars"
        className="w-[38px] h-[38px] rounded-full bg-chip hover:bg-btn border border-btn transition-colors flex items-center justify-center"
      >
        <Search size={15} strokeWidth={1.75} />
      </button>
    );

  const people = members.filter((m) => m.connected);
  const ownerName = (id?: string) => {
    const m = members.find((x) => x.id === id);
    return !m ? "" : m.me ? "You" : m.name;
  };
  const row = (e: SearchHit) => {
    const c = colorOf(e.ownerId);
    return (
      <button
        key={`${e.ownerId ?? ""}|${e.id}`}
        onClick={() => {
          setShowResults(false);
          onPick(e);
        }}
        className="w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-xl hover:bg-[#F4F6FA] transition-colors"
      >
        <span className="w-2.5 h-2.5 rounded-full mt-[5px] flex-shrink-0" style={{ backgroundColor: c.tx }} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-medium truncate">{e.title}</span>
          <span className="block text-[12px] text-muted truncate">
            {whenLabel(e)}
            {!owner && people.length > 1 ? ` · ${ownerName(e.ownerId)}` : ""}
          </span>
          {e.location && (
            <span className="flex items-center gap-1 text-[12px] text-muted truncate">
              <MapPin size={11} className="flex-shrink-0" /> <span className="truncate">{e.location}</span>
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <div className="relative">
      {showResults && <ClickAway onClose={() => setShowResults(false)} />}
      <div className="relative z-50 flex items-center gap-2 bg-chip rounded-full pl-3 pr-1 h-[38px] w-[min(440px,90vw)] border border-btn focus-within:border-btn-ring">
        {loading ? <Loader2 size={15} className="animate-spin text-muted flex-shrink-0" /> : <Search size={15} strokeWidth={1.75} className="text-muted flex-shrink-0" />}
        <input
          ref={input}
          value={q}
          onChange={(ev) => setQ(ev.target.value)}
          onFocus={() => hits && setShowResults(true)}
          onKeyDown={(ev) => {
            if (ev.key === "Escape") close();
            if (ev.key === "Enter" && hits) setShowResults(true);
          }}
          placeholder="Search events…"
          aria-label="Search events"
          className="flex-1 min-w-0 bg-transparent outline-none text-[13.5px] placeholder:text-muted"
        />
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setOwnerOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={ownerOpen}
            aria-label="Whose calendar to search"
            className={`flex items-center gap-1.5 rounded-full pl-2.5 pr-2 py-1 text-[12.5px] font-medium max-w-[170px] border transition-colors ${
              ownerOpen ? "bg-white border-[#C3CBDA]" : "bg-white/80 border-[#E1E5EE] hover:bg-white"
            }`}
          >
            {(() => {
              const m = people.find((x) => x.id === owner);
              return (
                <>
                  {m && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colorOf(m.id).tx }} />}
                  <span className="truncate">{!m ? "All calendars" : m.me ? "My calendar" : m.name}</span>
                </>
              );
            })()}
            <ChevronDown size={13} className={`flex-shrink-0 transition-transform ${ownerOpen ? "rotate-180" : ""}`} />
          </button>
          {ownerOpen && (
            <>
              <ClickAway onClose={() => setOwnerOpen(false)} />
              <div
                role="listbox"
                className="absolute right-0 top-[calc(100%+14px)] z-[60] w-[220px] max-h-[320px] overflow-y-auto bg-white rounded-2xl shadow-[0_0_0_6px_#ECEFF6,0_0_0_7px_#E1E5EE,0_24px_50px_-18px_rgba(18,17,16,0.28)] p-1.5"
              >
                <div className="px-3 pt-1.5 pb-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">Search in</div>
                {[{ id: "", label: "All calendars", dot: null as string | null }, ...people.map((m) => ({ id: m.id, label: m.me ? "My calendar" : m.name, dot: colorOf(m.id).tx }))].map((o) => (
                  <button
                    key={o.id || "all"}
                    type="button"
                    role="option"
                    aria-selected={owner === o.id}
                    onClick={() => {
                      setOwner(o.id);
                      setOwnerOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13.5px] font-medium text-left transition-colors ${
                      owner === o.id ? "bg-[#EEF1F6]" : "hover:bg-[#F4F6FA]"
                    }`}
                  >
                    {o.dot ? (
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: o.dot }} />
                    ) : (
                      <Users size={14} strokeWidth={1.75} className="text-muted flex-shrink-0" />
                    )}
                    <span className="flex-1 truncate">{o.label}</span>
                    {owner === o.id && <Check size={14} strokeWidth={2} className="flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button onClick={close} aria-label="Close search" title="Close search" className="w-7 h-7 rounded-full hover:bg-btn flex items-center justify-center flex-shrink-0">
          <X size={14} />
        </button>
      </div>

      {showResults && (error || hits) && (
        <div className="absolute right-0 top-[calc(100%+14px)] z-50 w-[min(440px,90vw)] bg-white rounded-2xl shadow-[0_0_0_6px_#ECEFF6,0_0_0_7px_#E1E5EE,0_24px_50px_-18px_rgba(18,17,16,0.28)] p-1.5">
          {error ? (
            <div className="px-3 py-3 text-[13px] text-red-700">{error}</div>
          ) : hits && hits.length === 0 ? (
            <div className="px-3 py-3 text-[13px] text-muted">No events match “{query}”.</div>
          ) : (
            <div className="scroll-on-hover max-h-[420px]">
              {groups.upcoming.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted">Upcoming</div>
                  {groups.upcoming.map(row)}
                </>
              )}
              {groups.past.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted">Past</div>
                  {groups.past.map(row)}
                </>
              )}
            </div>
          )}
          <div className="px-3 pt-2 pb-1.5 mt-1 border-t border-line text-[11.5px] text-muted">
            {more ? "Showing the first 100 matches. Add a word to narrow it down. " : ""}
            Searches 6 months back and 12 months ahead.
            {skipped.length > 0 ? ` Couldn’t search: ${skipped.join(", ")}.` : ""}
          </div>
        </div>
      )}
    </div>
  );
}
