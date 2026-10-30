"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Loader2, MapPin } from "lucide-react";

type Slot = { start: string; end: string };

// A prospective client picks a consultation time (free times in the firm's calendar).
export default function BookingPicker({ firmKey, token, firmName }: { firmKey: string; token: string; firmName: string }) {
  const [data, setData] = useState<{ slots: Slot[]; tz: string; minutes: number; location: string; booked: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ at: string; location: string } | null>(null);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    fetch(`/api/public/intake/${firmKey}/slots?t=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "Times couldn't be loaded.");
        setData(d);
      })
      .catch((e: Error) => setError(e.message));
  }, [firmKey, token]);

  const tz = data?.tz ?? "America/New_York";
  const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });
  const days = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of data?.slots ?? []) m.set(dayKey(s.start), [...(m.get(dayKey(s.start)) ?? []), s]);
    return [...m.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  const activeDay = day ?? days[0]?.[0] ?? null;
  const fmtDay = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const fmtFull = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

  async function book() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/public/intake/${firmKey}/book`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token, start: pick }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "The time couldn't be booked.");
      setDone({ at: d.appointmentAt, location: d.location ?? "" });
    } catch (e) {
      setError((e as Error).message);
      setPick(null);
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="rounded-2xl bg-[#EFF8F2] px-5 py-4 flex gap-3">
        <CalendarCheck size={22} className="text-[#00A35F] flex-shrink-0 mt-0.5" />
        <div className="text-[15px] leading-relaxed">
          <b>You&apos;re booked for {fmtFull(done.at)}.</b>
          {done.location && <div className="flex items-center gap-1.5 mt-1"><MapPin size={14} /> {done.location}</div>}
          <div className="text-[13.5px] text-[#5B616B] mt-1">A calendar invitation is on its way to your email. Need to change it? Reply to that email or call {firmName}.</div>
        </div>
      </div>
    );
  if (error && !data) return <div className="rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3 text-[14px]">{error}</div>;
  if (!data)
    return (
      <div className="flex items-center gap-2 text-[14px] text-[#6B7280] py-4">
        <Loader2 size={15} className="animate-spin" /> Finding open times…
      </div>
    );
  if (data.booked && !changing)
    return (
      <div className="rounded-2xl bg-[#EFF8F2] px-5 py-4 text-[15px]">
        Your consultation is booked for <b>{fmtFull(data.booked)}</b>.{" "}
        <button onClick={() => setChanging(true)} className="underline underline-offset-2 text-[14px]">
          Pick a different time
        </button>
      </div>
    );
  if (!days.length) return <div className="text-[14.5px] text-[#5B616B]">There are no open times online right now. We&apos;ll contact you to set one up.</div>;

  return (
    <div>
      <div className="text-[16px] font-semibold mb-1">Pick a time for your consultation</div>
      <div className="text-[13.5px] text-[#5B616B] mb-3">
        {data.minutes} minutes{data.location ? ` · ${data.location}` : ""} · times in {new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longGeneric" }).formatToParts(new Date()).find((x) => x.type === "timeZoneName")?.value ?? tz}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
        {days.map(([d, list]) => (
          <button
            key={d}
            type="button"
            onClick={() => (setDay(d), setPick(null))}
            className={`flex-shrink-0 px-3.5 py-2 rounded-xl border text-[13.5px] text-left ${activeDay === d ? "border-[#1B191A] bg-[#1B191A] text-white" : "border-[#D1D7E0] bg-white hover:border-[#5E6E8C]"}`}
          >
            <div className="font-semibold">{fmtDay(d)}</div>
            <div className={`text-[12px] ${activeDay === d ? "text-white/80" : "text-[#6B7280]"}`}>{list.length} open</div>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
        {(days.find(([d]) => d === activeDay)?.[1] ?? []).map((s) => (
          <button
            key={s.start}
            type="button"
            onClick={() => setPick(s.start)}
            className={`px-2 py-2.5 rounded-xl border text-[14px] font-medium ${pick === s.start ? "border-[#00A35F] bg-[#EFF8F2]" : "border-[#D1D7E0] bg-white hover:border-[#5E6E8C]"}`}
          >
            {fmtTime(s.start)}
          </button>
        ))}
      </div>
      {error && <div className="mb-3 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3 text-[14px]">{error}</div>}
      <button type="button" onClick={book} disabled={!pick || busy} className="bg-[#1B191A] text-white px-6 py-3 rounded-full text-[15px] font-semibold disabled:opacity-40 flex items-center gap-2">
        {busy && <Loader2 size={16} className="animate-spin" />} {pick ? `Book ${fmtFull(pick)}` : "Choose a time"}
      </button>
    </div>
  );
}
