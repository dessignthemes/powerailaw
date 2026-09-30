"use client";

import { useEffect, useState } from "react";
import {
  X,
  Loader2,
  Clock,
  MapPin,
  Users,
  Video,
  ExternalLink,
  Trash2,
  AlertTriangle,
  CalendarDays,
  Pencil,
} from "lucide-react";

type Provider = "google" | "microsoft";
export type EventRef = {
  id: string;
  provider: Provider;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  link: string | null;
};
type Detail = EventRef & {
  notes: string | null;
  organizer: string | null;
  attendees: { name: string | null; email: string; response: string | null }[];
  joinUrl: string | null;
};

const providerName: Record<Provider, string> = {
  google: "Google Calendar",
  microsoft: "Outlook",
};

// "m:AAMk…" / "g:abc…" → the calendar's own id
const rawId = (id: string) => id.replace(/^[mg]:/, "");

function whenText(e: EventRef) {
  if (e.allDay) {
    const s = new Date(`${e.start}T00:00:00`);
    const last = new Date(`${e.end}T00:00:00`);
    last.setDate(last.getDate() - 1); // end is exclusive
    const fmt = (d: Date) =>
      d.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    return last > s
      ? `${fmt(s)} – ${fmt(last)} · All day`
      : `${fmt(s)} · All day`;
  }
  const s = new Date(e.start);
  const en = new Date(e.end);
  const day = s.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const t = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const sameDay = s.toDateString() === en.toDateString();
  return sameDay
    ? `${day} · ${t(s)} – ${t(en)}`
    : `${day} ${t(s)} – ${en.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${t(en)}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const localYmd = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localHm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

type Form = {
  title: string;
  allDay: boolean;
  date: string;
  endDate: string;
  start: string;
  end: string;
  location: string;
  notes: string;
};

function toForm(e: Detail): Form {
  if (e.allDay) {
    const last = new Date(`${e.end}T00:00:00`);
    last.setDate(last.getDate() - 1); // stored end is exclusive
    return {
      title: e.title,
      allDay: true,
      date: e.start,
      endDate: localYmd(last) < e.start ? e.start : localYmd(last),
      start: "09:00",
      end: "10:00",
      location: e.location ?? "",
      notes: e.notes ?? "",
    };
  }
  const s = new Date(e.start);
  const en = new Date(e.end);
  return {
    title: e.title,
    allDay: false,
    date: localYmd(s),
    endDate: localYmd(en),
    start: localHm(s),
    end: localHm(en),
    location: e.location ?? "",
    notes: e.notes ?? "",
  };
}

const responseLabel: Record<string, string> = {
  accepted: "Accepted",
  tentativelyAccepted: "Tentative",
  tentative: "Tentative",
  declined: "Declined",
  needsAction: "No response",
  notResponded: "No response",
  none: "No response",
  organizer: "Organizer",
};

export default function EventDetailModal({
  event,
  onClose,
  onDeleted,
  onUpdated,
}: {
  event: EventRef;
  onClose: () => void;
  onDeleted?: (id: string) => void;
  onUpdated?: (e: EventRef) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<Form | null>(null); // set while editing
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form || !detail) return;
    if (!form.title.trim()) return setError("Give the event a title.");
    let start: string, end: string;
    if (form.allDay) {
      const lastDay =
        form.endDate && form.endDate >= form.date ? form.endDate : form.date;
      const after = new Date(`${lastDay}T00:00:00`);
      after.setDate(after.getDate() + 1);
      start = form.date;
      end = localYmd(after);
    } else {
      const s0 = new Date(`${form.date}T${form.start}`);
      const e0 = new Date(`${form.endDate || form.date}T${form.end}`);
      if (!(e0 > s0)) return setError("The end has to be after the start.");
      start = s0.toISOString();
      end = e0.toISOString();
    }
    setSaving(true);
    setError(null);
    try {
      const notesChanged = form.notes !== (detail.notes ?? "");
      const r = await fetch(
        `/api/calendar/events/${encodeURIComponent(rawId(event.id))}?provider=${event.provider}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title.trim(),
            allDay: form.allDay,
            start,
            end,
            location: form.location,
            ...(notesChanged ? { notes: form.notes } : {}),
          }),
        },
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? "Couldn't save your changes.");
      setDetail(d.event as Detail);
      onUpdated?.(d.event as EventRef);
      setForm(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/calendar/events/${encodeURIComponent(rawId(event.id))}?provider=${event.provider}`,
    )
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error ?? "Couldn't load this event.");
        return d.event as Detail;
      })
      .then((d) => !cancelled && setDetail(d))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [event.id, event.provider]);

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (form) setForm(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, form]);

  async function remove() {
    if (
      !confirm(
        `Delete "${event.title}"? It's removed from your ${providerName[event.provider]} calendar too.`,
      )
    )
      return;
    setDeleting(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/calendar/events/${encodeURIComponent(rawId(event.id))}?provider=${event.provider}`,
        { method: "DELETE" },
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? "Couldn't delete the event.");
      onDeleted?.(event.id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }

  const e = detail ?? event;
  const link = detail?.link ?? event.link;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-8"
      onClick={onClose}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        className="bg-cream rounded-3xl w-full max-w-[720px] max-h-[88vh] overflow-y-auto flex flex-col"
      >
        <div className="flex items-center justify-between px-7 pt-6 pb-2">
          <span className="flex items-center gap-2 text-[13px] text-muted font-medium">
            <span className="bg-card-alt px-2.5 py-1 rounded-full flex items-center gap-1.5">
              <CalendarDays size={13} strokeWidth={1.75} />{" "}
              {providerName[event.provider]}
            </span>
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-ink"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {form ? (
          <div className="px-7 pt-2 pb-6 flex-1">
            <h2 className="text-[20px] font-semibold mb-4">Edit event</h2>
            {(() => {
              const field =
                "w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none focus:border-ink";
              const set = (p: Partial<Form>) => setForm({ ...form, ...p });
              return (
                <>
                  <label className="block text-[12.5px] font-medium text-muted mb-1">
                    Title
                  </label>
                  <input
                    autoFocus
                    value={form.title}
                    maxLength={255}
                    onChange={(ev) => set({ title: ev.target.value })}
                    className={`${field} mb-3`}
                  />
                  <label className="flex items-center gap-2 text-[13.5px] mb-3 cursor-pointer select-none w-fit">
                    <input
                      type="checkbox"
                      checked={form.allDay}
                      onChange={(ev) => set({ allDay: ev.target.checked })}
                      className="w-4 h-4 accent-black"
                    />
                    All day
                  </label>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-[12.5px] font-medium text-muted mb-1">
                        Starts
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="date"
                          value={form.date}
                          onChange={(ev) =>
                            set({
                              date: ev.target.value,
                              endDate:
                                form.endDate < ev.target.value
                                  ? ev.target.value
                                  : form.endDate,
                            })
                          }
                          className={field}
                        />
                        {!form.allDay && (
                          <input
                            type="time"
                            value={form.start}
                            onChange={(ev) => set({ start: ev.target.value })}
                            className={`${field} w-[130px]`}
                          />
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[12.5px] font-medium text-muted mb-1">
                        Ends
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="date"
                          value={form.endDate}
                          min={form.date}
                          onChange={(ev) => set({ endDate: ev.target.value })}
                          className={field}
                        />
                        {!form.allDay && (
                          <input
                            type="time"
                            value={form.end}
                            onChange={(ev) => set({ end: ev.target.value })}
                            className={`${field} w-[130px]`}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  <label className="block text-[12.5px] font-medium text-muted mb-1">
                    Location
                  </label>
                  <input
                    value={form.location}
                    maxLength={255}
                    onChange={(ev) => set({ location: ev.target.value })}
                    placeholder="Add a location"
                    className={`${field} mb-3`}
                  />
                  <label className="block text-[12.5px] font-medium text-muted mb-1">
                    Notes
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(ev) => set({ notes: ev.target.value })}
                    rows={8}
                    className={`${field} resize-y leading-relaxed`}
                  />
                  {detail && detail.attendees.length > 0 && (
                    <p className="text-[12.5px] text-muted mt-2">
                      If you organized this meeting,{" "}
                      {event.provider === "microsoft" ? "Outlook" : "Google"}{" "}
                      sends the updated details to the attendees.
                    </p>
                  )}
                  {error && (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700 flex items-center gap-2">
                      <AlertTriangle size={14} /> {error}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        ) : (
          <div className="px-7 pt-2 pb-6 flex-1">
            <h2 className="text-[26px] font-semibold leading-tight mb-5">
              {e.title}
            </h2>

            <div className="flex flex-col gap-3 text-[14.5px] mb-6">
              <div className="flex items-start gap-3">
                <Clock
                  size={16}
                  strokeWidth={1.75}
                  className="text-muted mt-0.5 flex-shrink-0"
                />
                <span>{whenText(e)}</span>
              </div>
              {e.location && (
                <div className="flex items-start gap-3">
                  <MapPin
                    size={16}
                    strokeWidth={1.75}
                    className="text-muted mt-0.5 flex-shrink-0"
                  />
                  <span>{e.location}</span>
                </div>
              )}
              {detail?.joinUrl && (
                <div className="flex items-start gap-3">
                  <Video
                    size={16}
                    strokeWidth={1.75}
                    className="text-muted mt-0.5 flex-shrink-0"
                  />
                  <a
                    href={detail.joinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-btn text-ink px-3.5 py-1.5 rounded-full text-[13px] font-medium hover:bg-btn-hover"
                  >
                    Join meeting
                  </a>
                </div>
              )}
              {detail && (detail.organizer || detail.attendees.length > 0) && (
                <div className="flex items-start gap-3">
                  <Users
                    size={16}
                    strokeWidth={1.75}
                    className="text-muted mt-0.5 flex-shrink-0"
                  />
                  <div className="flex flex-col gap-1 min-w-0">
                    {detail.organizer && (
                      <span>
                        <span className="text-muted">Organizer:</span>{" "}
                        {detail.organizer}
                      </span>
                    )}
                    {detail.attendees.map((a) => (
                      <span key={a.email} className="text-[13.5px] truncate">
                        {a.name ? `${a.name} ` : ""}
                        <span className="text-muted">
                          {a.name ? `<${a.email}>` : a.email}
                        </span>
                        {a.response && responseLabel[a.response] && (
                          <span className="text-muted">
                            {" "}
                            · {responseLabel[a.response]}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700 flex items-center gap-2">
                <AlertTriangle size={14} /> {error}
              </div>
            )}

            <div className="text-[12px] font-semibold uppercase tracking-wide text-muted mb-2">
              Notes
            </div>
            {!detail && !error ? (
              <div className="flex items-center gap-2 text-[14px] text-muted py-3">
                <Loader2 size={14} className="animate-spin" /> Loading details…
              </div>
            ) : detail?.notes ? (
              <div className="bg-white border border-line rounded-2xl px-5 py-4 text-[14.5px] leading-relaxed whitespace-pre-wrap break-words max-h-[40vh] overflow-y-auto">
                {detail.notes}
              </div>
            ) : (
              <div className="text-[14px] text-muted py-2">No notes.</div>
            )}
          </div>
        )}

        <div className="border-t border-line px-7 py-4 flex items-center justify-between gap-3">
          {form ? (
            <>
              <button
                onClick={() => {
                  setForm(null);
                  setError(null);
                }}
                disabled={saving}
                className="px-3 py-2 rounded-full text-[13.5px] font-medium text-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="bg-btn text-ink px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-btn-hover disabled:opacity-50 flex items-center gap-1.5"
              >
                {saving && <Loader2 size={14} className="animate-spin" />} Save
                changes
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <button
                  onClick={remove}
                  disabled={deleting}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[13.5px] font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
                >
                  {deleting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} strokeWidth={1.75} />
                  )}{" "}
                  Delete event
                </button>
                <button
                  onClick={() => {
                    if (detail) {
                      setError(null);
                      setForm(toForm(detail));
                    }
                  }}
                  disabled={!detail}
                  title={detail ? undefined : "Loading…"}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13.5px] font-medium text-ink bg-card-alt hover:bg-line/70 transition-colors disabled:opacity-40"
                >
                  <Pencil size={14} strokeWidth={1.75} /> Edit event
                </button>
              </div>
              <div className="flex items-center gap-2">
                {link && (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13.5px] font-medium text-ink bg-card-alt hover:bg-line/70 transition-colors"
                  >
                    <ExternalLink size={13} strokeWidth={1.75} /> Open in{" "}
                    {event.provider === "microsoft" ? "Outlook" : "Google"}
                  </a>
                )}
                <button
                  onClick={onClose}
                  className="bg-btn text-ink px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-btn-hover"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
