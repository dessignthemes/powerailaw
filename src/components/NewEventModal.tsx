"use client";

import ClickAway from "@/components/ClickAway";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import { useEffect, useMemo, useState } from "react";
import { Calendar as CalendarIcon, X, Folder, Search, MapPin, UserPlus, Users, Check, Mail, Clock } from "lucide-react";
import { initialsFor } from "@/lib/initials";
import DropdownField from "@/components/DropdownField";
import ColorPicker from "@/components/ColorPicker";
import { TimeDateBox } from "@/components/TimeDateBox";

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  type: string;
  isTask: boolean;
  endDate?: string;
  allDay?: boolean;
  description?: string;
  location?: string;
  attendees?: Attendee[];
  reminderMinutes?: number | null;
  repeat?: "daily" | "weekly" | "monthly" | "yearly" | null;
  calendar?: { provider: "google" | "microsoft"; id: string } | null;
  matterId?: string | null;
};

export type Attendee = { email: string; name: string; kind: "staff" | "client" | "contact" | "email" };
type Cal = { provider: "google" | "microsoft"; account: string | null; id: string; name: string; isDefault: boolean };
type ContactLite = { id: string; name: string; email: string | null; company?: string; role?: string };

const REMINDER_MINUTES: Record<string, number | null> = {
  "No reminders": null,
  "At event start": 0,
  "5 min before": 5,
  "15 min before": 15,
  "30 min before": 30,
  "1 hour before": 60,
  "2 hours before": 120,
  "1 day before": 1440,
};
const REPEAT_VALUE: Record<string, CalendarEvent["repeat"]> = { "Does not repeat": null, Daily: "daily", Weekly: "weekly", Monthly: "monthly", Yearly: "yearly" };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Remembered for the session: the person's calendars and places used before.
let calCache: Cal[] | null = null;
let locCache: string[] | null = null;
let contactCache: ContactLite[] | null = null;

const reminderOptions = [
  "No reminders",
  "At event start",
  "5 min before",
  "15 min before",
  "30 min before",
  "1 hour before",
  "2 hours before",
  "1 day before",
];

const repeatOptions = ["Does not repeat", "Daily", "Weekly", "Monthly", "Yearly"];

const typeOptions = ["Meeting", "Hearing", "Filing deadline", "Call", "Other"];

function parseDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(iso: string) {
  return parseDate(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number) {
  const wrapped = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function NewEventModal({
  initialDate,
  onClose,
  onCreate,
}: {
  initialDate: string;
  onClose: () => void;
  onCreate: (event: CalendarEvent) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(initialDate);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [reminder, setReminder] = useState("No reminders");
  const [repeat, setRepeat] = useState("Does not repeat");
  const [type, setType] = useState("Meeting");
  const [color, setColor] = useState("#3B82F6");
  const [asTask, setAsTask] = useState(false);
  const { meEmail, teamMembers, clients, matters } = useWorkspaceData();
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [attQuery, setAttQuery] = useState("");
  const [attOpen, setAttOpen] = useState(false);
  const [attHi, setAttHi] = useState(0);
  const [staffOpen, setStaffOpen] = useState(false);
  const [location, setLocation] = useState("");
  const [locOpen, setLocOpen] = useState(false);
  const [locations, setLocations] = useState<string[]>(locCache ?? []);
  const [calendars, setCalendars] = useState<Cal[] | null>(calCache);
  const [calKey, setCalKey] = useState<string>("");
  const [contacts, setContacts] = useState<ContactLite[]>(contactCache ?? []);
  const [matterId, setMatterId] = useState<string | null>(null);
  const matterObj = matterId ? matters.find((m) => m.id === matterId) ?? null : null;
  const matter = matterObj ? [matterObj.matterNumber, matterObj.title].filter(Boolean).join(" · ") : null;

  useEffect(() => {
    if (!calCache)
      fetch("/api/calendar/calendars")
        .then((r) => (r.ok ? r.json() : { calendars: [] }))
        .then((d: { calendars?: Cal[] }) => {
          calCache = d.calendars ?? [];
          setCalendars(calCache);
        })
        .catch(() => setCalendars([]));
    if (!locCache)
      fetch("/api/calendar/locations")
        .then((r) => (r.ok ? r.json() : { locations: [] }))
        .then((d: { locations?: string[] }) => {
          locCache = d.locations ?? [];
          setLocations(locCache);
        })
        .catch(() => undefined);
    if (!contactCache)
      fetch("/api/contacts")
        .then((r) => (r.ok ? r.json() : { contacts: [] }))
        .then((d: { contacts?: ContactLite[] }) => {
          contactCache = (d.contacts ?? []).filter((c) => c.email && EMAIL.test(c.email));
          setContacts(contactCache);
        })
        .catch(() => undefined);
  }, []);
  const calendar = calendars?.find((c) => `${c.provider}:${c.id}` === calKey) ?? calendars?.[0] ?? null;

  const has = (email: string) => attendees.some((a) => a.email.toLowerCase() === email.toLowerCase());
  const addAttendee = (a: Attendee) => {
    if (!has(a.email)) setAttendees((list) => [...list, a]);
    setAttQuery("");
    setAttHi(0);
  };
  const staff = teamMembers.filter((m) => m.email && m.email.toLowerCase() !== (meEmail ?? "").toLowerCase());
  const suggestions = useMemo(() => {
    const q = attQuery.trim().toLowerCase();
    if (q.length < 2) return [] as Attendee[];
    const words = q.split(/\s+/);
    const hit = (s: string) => words.every((w) => s.toLowerCase().includes(w));
    const out: Attendee[] = [];
    for (const m of staff) if (hit(`${m.fullName ?? ""} ${m.email}`)) out.push({ email: m.email, name: m.fullName || m.email, kind: "staff" });
    for (const c of clients) if (c.email && EMAIL.test(c.email) && hit(`${c.name} ${c.email}`)) out.push({ email: c.email, name: c.name, kind: "client" });
    for (const c of contacts) if (c.email && hit(`${c.name} ${c.email} ${c.company ?? ""}`)) out.push({ email: c.email, name: c.name, kind: "contact" });
    const seen = new Set<string>();
    const list = out.filter((a) => !has(a.email) && !seen.has(a.email.toLowerCase()) && (seen.add(a.email.toLowerCase()), true)).slice(0, 10);
    if (EMAIL.test(attQuery.trim()) && !list.some((a) => a.email.toLowerCase() === q) && !has(q)) list.push({ email: attQuery.trim(), name: attQuery.trim(), kind: "email" });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attQuery, clients, contacts, teamMembers, attendees]);
  // Clients with no email on their card: say so instead of silently finding nothing.
  const noEmailClients = attQuery.trim().length >= 2 ? clients.filter((c) => !c.email && attQuery.trim().toLowerCase().split(/\s+/).every((w) => c.name.toLowerCase().includes(w))).slice(0, 2) : [];
  // The picked matter's client, offered as an attendee.
  const matterClient = matterObj?.clientId ? clients.find((c) => c.id === matterObj.clientId) ?? null : null;

  const locMatches = (() => {
    const q = location.trim().toLowerCase();
    const list = q ? locations.filter((l) => l.toLowerCase().includes(q) && l.toLowerCase() !== q) : locations;
    return list.slice(0, 8);
  })();
  const [matterOpen, setMatterOpen] = useState(false);
  const [matterSearch, setMatterSearch] = useState("");

  function shiftTime(which: "start" | "end", delta: number) {
    if (which === "start") {
      setStart(minutesToTime(timeToMinutes(start) + delta));
    } else {
      setEnd(minutesToTime(timeToMinutes(end) + delta));
    }
  }

  function shiftDate(which: "start" | "end", delta: number) {
    if (which === "start") {
      const d = parseDate(date);
      d.setDate(d.getDate() + delta);
      setDate(toISODate(d));
    } else {
      const d = parseDate(endDate);
      d.setDate(d.getDate() + delta);
      setEndDate(toISODate(d));
    }
  }

  function handleCreate() {
    const matterLine = matterObj ? `Matter: ${[matterObj.matterNumber, matterObj.title].filter(Boolean).join(" — ")}` : "";
    onCreate({
      id: crypto.randomUUID(),
      title: title || "Untitled event",
      date,
      start,
      end,
      type,
      isTask: asTask,
      endDate: endDate || date,
      allDay,
      description: [description.trim(), matterLine].filter(Boolean).join("\n\n"),
      location: location.trim(),
      attendees,
      reminderMinutes: REMINDER_MINUTES[reminder] ?? null,
      repeat: REPEAT_VALUE[repeat] ?? null,
      calendar: calendar ? { provider: calendar.provider, id: calendar.id } : null,
      matterId,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-cream rounded-3xl w-full max-w-[560px] max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-7 pt-6 pb-2">
          <div className="flex items-center gap-2 text-[13.5px] text-muted font-medium">
            <CalendarIcon size={14} strokeWidth={1.75} /> Calendar
            <span className="text-muted">›</span>
            <span className="text-ink font-semibold">New event</span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-7 pt-3 pb-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Event title"
            maxLength={150}
            className="w-full bg-transparent outline-none text-[22px] font-medium placeholder:text-muted mb-2"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add description..."
            rows={2}
            className="w-full bg-transparent outline-none text-[14px] placeholder:text-muted resize-none"
          />
        </div>

        <div className="px-7 py-5 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <TimeDateBox
              timeLabel={start}
              dateLabel={formatDateLabel(date)}
              onTimePrev={() => shiftTime("start", -30)}
              onTimeNext={() => shiftTime("start", 30)}
              onDatePrev={() => shiftDate("start", -1)}
              onDateNext={() => shiftDate("start", 1)}
            />
            <span className="text-muted">–</span>
            <TimeDateBox
              timeLabel={end}
              dateLabel={formatDateLabel(endDate)}
              onTimePrev={() => shiftTime("end", -30)}
              onTimeNext={() => shiftTime("end", 30)}
              onDatePrev={() => shiftDate("end", -1)}
              onDateNext={() => shiftDate("end", 1)}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[14px] font-medium">All day</span>
            <button
              onClick={() => setAllDay((a) => !a)}
              className={`w-10 h-6 rounded-full transition-colors relative ${
                allDay ? "bg-dark" : "bg-line"
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                  allDay ? "left-[18px]" : "left-0.5"
                }`}
              />
            </button>
          </div>

          <div className="border-t border-line" />

          <div className="flex items-center justify-between gap-4">
            <span className="text-[14px] font-medium text-muted flex-shrink-0">Notify</span>
            <DropdownField value={reminder} options={reminderOptions} onChange={setReminder} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[14px] font-medium text-muted flex-shrink-0">Repeats</span>
            <DropdownField value={repeat} options={repeatOptions} onChange={setRepeat} />
          </div>

          <div className="border-t border-line" />

          <div className="flex items-center justify-between gap-4">
            <span className="text-[14px] font-medium text-muted flex-shrink-0">Type</span>
            <div className="flex items-center gap-2 flex-1">
              <DropdownField value={type} options={typeOptions} onChange={setType} />
              <ColorPicker value={color} onChange={setColor} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 relative">
            <span className="text-[14px] font-medium text-muted flex-shrink-0">Matter</span>
            <div className="flex-1 relative">
              <button
                onClick={() => setMatterOpen((o) => !o)}
                className="w-full flex items-center gap-2 border border-line rounded-xl px-3.5 py-2.5 text-[13.5px] bg-chip hover:bg-btn transition-colors text-left"
              >
                <Folder size={13} strokeWidth={1.75} className="text-muted flex-shrink-0" />
                <span className={matter ? "text-ink" : "text-muted"}>{matter ?? "Matter"}</span>
              </button>
              {matterOpen && (
                <>
                  <ClickAway onClose={() => setMatterOpen(false)} />
                  <div className="absolute left-0 top-[calc(100%+6px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-2.5 w-full min-w-[260px]">
                    <div className="relative mb-2">
                      <Search
                        size={13}
                        strokeWidth={1.75}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                      />
                      <input
                        autoFocus
                        value={matterSearch}
                        onChange={(e) => setMatterSearch(e.target.value)}
                        placeholder="Search matter, client, email..."
                        className="w-full bg-card-alt rounded-lg pl-8 pr-3 py-2 text-[13.5px] outline-none placeholder:text-muted"
                      />
                    </div>
                    <button
                      onClick={() => {
                        setMatterId(null);
                        setMatterOpen(false);
                        setMatterSearch("");
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip transition-colors text-muted"
                    >
                      <Folder size={14} strokeWidth={1.75} /> No matter
                    </button>
                    <div className="max-h-[220px] overflow-y-auto">
                      {matters
                        .filter((m) => {
                          const q = matterSearch.trim().toLowerCase();
                          if (!q) return m.status !== "Closed";
                          const cl = m.clientId ? clients.find((c) => c.id === m.clientId) : null;
                          return `${m.matterNumber ?? ""} ${m.title} ${cl?.name ?? ""} ${cl?.email ?? ""}`.toLowerCase().includes(q);
                        })
                        .slice(0, 40)
                        .map((m) => (
                          <button
                            key={m.id}
                            onClick={() => {
                              setMatterId(m.id);
                              setMatterOpen(false);
                              setMatterSearch("");
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[13.5px] hover:bg-chip text-left"
                          >
                            {m.matterNumber && <span className="font-semibold flex-shrink-0">{m.matterNumber}</span>}
                            <span className="truncate text-muted">{m.title}</span>
                            {m.status === "Closed" && <span className="text-[11.5px] text-muted flex-shrink-0">closed</span>}
                          </button>
                        ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[14px] font-medium text-muted">Attendees</span>
              <div className="relative">
                <button type="button" onClick={() => setStaffOpen((o) => !o)} className="flex items-center gap-1.5 bg-chip hover:bg-btn rounded-full px-3 py-1 text-[12.5px] font-medium">
                  <Users size={13} /> Add staff
                </button>
                {staffOpen && (
                  <>
                    <ClickAway onClose={() => setStaffOpen(false)} />
                    <div className="absolute right-0 top-[calc(100%+6px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 w-[260px] max-h-[260px] overflow-y-auto">
                      {staff.length === 0 && <div className="px-3 py-2 text-[13px] text-muted">No other staff in the workspace yet.</div>}
                      {staff.map((m) => {
                        const on = has(m.email);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => (on ? setAttendees((l) => l.filter((x) => x.email.toLowerCase() !== m.email.toLowerCase())) : addAttendee({ email: m.email, name: m.fullName || m.email, kind: "staff" }))}
                            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl hover:bg-chip text-left text-[13.5px]"
                          >
                            <span className="w-6 h-6 rounded-full bg-card-alt text-[10px] font-semibold flex items-center justify-center flex-shrink-0">{initialsFor(m.fullName, m.email)}</span>
                            <span className="flex-1 min-w-0">
                              <span className="block truncate font-medium">{m.fullName || m.email}</span>
                              {m.fullName && <span className="block truncate text-[12px] text-muted">{m.email}</span>}
                            </span>
                            {on && <Check size={14} />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="relative mb-2">
              <Search size={14} strokeWidth={1.75} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={attQuery}
                onChange={(e) => (setAttQuery(e.target.value), setAttOpen(true), setAttHi(0))}
                onFocus={() => setAttOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setAttHi((h) => Math.min(h + 1, suggestions.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setAttHi((h) => Math.max(h - 1, 0));
                  } else if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
                    if (suggestions[attHi]) {
                      e.preventDefault();
                      addAttendee(suggestions[attHi]);
                    }
                  }
                }}
                placeholder="Type a client, contact or staff name, or an email"
                aria-label="Add attendee"
                autoComplete="off"
                className="w-full border border-line rounded-xl pl-9 pr-3.5 py-2.5 text-[14px] bg-white outline-none placeholder:text-muted focus:border-btn-ring"
              />
              {attOpen && (suggestions.length > 0 || noEmailClients.length > 0) && (
                <>
                  <ClickAway onClose={() => setAttOpen(false)} />
                  <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 max-h-[280px] overflow-y-auto" role="listbox">
                    {suggestions.map((a, i) => (
                      <button
                        key={`${a.kind}:${a.email}`}
                        type="button"
                        role="option"
                        aria-selected={i === attHi}
                        onMouseEnter={() => setAttHi(i)}
                        onClick={() => addAttendee(a)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left text-[13.5px] ${i === attHi ? "bg-chip" : ""}`}
                      >
                        <span className="w-6 h-6 rounded-full bg-card-alt text-[10px] font-semibold flex items-center justify-center flex-shrink-0">
                          {a.kind === "email" ? <Mail size={12} /> : initialsFor(a.name, a.email)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate font-medium">{a.kind === "email" ? `Invite ${a.email}` : a.name}</span>
                          {a.kind !== "email" && <span className="block truncate text-[12px] text-muted">{a.email}</span>}
                        </span>
                        <span className="text-[11px] font-semibold text-muted uppercase tracking-wide flex-shrink-0">{a.kind === "staff" ? "Staff" : a.kind === "client" ? "Client" : a.kind === "contact" ? "Contact" : ""}</span>
                      </button>
                    ))}
                    {noEmailClients.map((c) => (
                      <div key={c.id} className="px-2.5 py-2 text-[12.5px] text-muted">
                        {c.name} is a client but has no email on their card.
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            {matterClient && matterClient.email && EMAIL.test(matterClient.email) && !has(matterClient.email) && (
              <button
                type="button"
                onClick={() => addAttendee({ email: matterClient.email!, name: matterClient.name, kind: "client" })}
                className="flex items-center gap-1.5 text-[12.5px] font-medium bg-white border border-dashed border-line hover:border-btn-ring rounded-full px-3 py-1 mb-2"
              >
                <UserPlus size={13} /> Invite the client: {matterClient.name}
              </button>
            )}
            <div className="flex flex-wrap gap-2">
              {attendees.map((a) => (
                <div key={a.email} title={a.email} className="flex items-center gap-1.5 bg-card-alt rounded-full pl-1 pr-2.5 py-1 text-[13px] font-medium">
                  <span className="w-5 h-5 rounded-full bg-white border border-line text-muted flex items-center justify-center text-[9.5px]">{initialsFor(a.name, a.email)}</span>
                  {a.name !== a.email ? a.name : a.email}
                  {a.kind !== "email" && <span className="text-[11px] text-muted font-normal">{a.kind === "staff" ? "staff" : a.kind}</span>}
                  <button onClick={() => setAttendees((ats) => ats.filter((x) => x.email !== a.email))} aria-label={`Remove ${a.name}`} className="text-muted hover:text-ink">
                    <X size={11} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
            {attendees.length > 0 && !asTask && (
              <p className="text-[12px] text-muted mt-2">
                {calendar?.provider === "google" ? "Google Calendar" : "Outlook"} sends each attendee an invitation from your calendar.
              </p>
            )}
          </div>

          <div>
            <span className="text-[14px] font-medium text-muted block mb-2">Location</span>
            <div className="relative">
              <MapPin size={14} strokeWidth={1.75} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={location}
                onChange={(e) => (setLocation(e.target.value), setLocOpen(true))}
                onFocus={() => setLocOpen(true)}
                onKeyDown={(e) => e.key === "Escape" && locOpen && (e.stopPropagation(), setLocOpen(false))}
                placeholder="Office, address, or call link"
                aria-label="Location"
                autoComplete="off"
                maxLength={255}
                className="w-full border border-line rounded-xl pl-9 pr-3.5 py-2.5 text-[14px] bg-white outline-none placeholder:text-muted focus:border-btn-ring"
              />
              {locOpen && locMatches.length > 0 && (
                <>
                  <ClickAway onClose={() => setLocOpen(false)} />
                  <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 max-h-[260px] overflow-y-auto">
                    <div className="px-2.5 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Used before</div>
                    {locMatches.map((l) => (
                      <button key={l} type="button" onClick={() => (setLocation(l), setLocOpen(false))} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl hover:bg-chip text-left text-[13.5px]">
                        <Clock size={13} className="text-muted flex-shrink-0" />
                        <span className="truncate">{l}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {!asTask && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-[14px] font-medium text-muted flex-shrink-0">Saves to</span>
              {calendars === null ? (
                <span className="text-[13px] text-muted">Loading your calendars…</span>
              ) : calendars.length === 0 ? (
                <span className="text-[13px] text-muted text-right">No calendar connected. Connect Outlook in Settings → Integrations.</span>
              ) : (
                <select
                  value={calendar ? `${calendar.provider}:${calendar.id}` : ""}
                  onChange={(e) => setCalKey(e.target.value)}
                  aria-label="Calendar"
                  className="flex-1 min-w-0 border border-line rounded-xl px-3 py-2.5 text-[13.5px] bg-white outline-none focus:border-btn-ring"
                >
                  {calendars.map((c) => (
                    <option key={`${c.provider}:${c.id}`} value={`${c.provider}:${c.id}`}>
                      {c.provider === "google" ? "Google" : "Outlook"} · {c.name}
                      {c.isDefault ? " (main)" : ""}
                      {c.account ? ` · ${c.account}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          {!asTask && calendar && !calendar.isDefault && (
            <p className="text-[12px] text-muted -mt-3">LawPower&apos;s calendar shows your main calendar, so events saved here appear in Outlook but not on this page.</p>
          )}

          <div className="border-t border-line" />

          <div className="flex items-center justify-between">
            <span className="text-[14px] font-medium">Create as task instead of event</span>
            <button
              onClick={() => setAsTask((t) => !t)}
              className={`w-10 h-6 rounded-full transition-colors relative ${
                asTask ? "bg-dark" : "bg-line"
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                  asTask ? "left-[18px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-7 py-5 border-t border-line">
          <button
            onClick={onClose}
            className="text-[14px] font-medium text-muted hover:text-ink transition-colors px-2"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="bg-btn text-ink px-5 py-2.5 rounded-full text-[14px] font-medium hover:bg-btn-hover transition-colors"
          >
            {asTask ? "Create task" : "Create event"}
          </button>
        </div>
      </div>
    </div>
  );
}
