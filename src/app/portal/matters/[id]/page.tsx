"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, TrendingUp, Building2, Users, PenLine, Star, AlertTriangle } from "lucide-react";
import PortalMessages from "@/app/portal/PortalMessages";

type Stage = { key: string; label: string; date: string | null; state: "done" | "current" | "upcoming" | "skipped"; star?: boolean };
type View = {
  firm: string;
  matter: { id: string; title: string; number: string | null; kind: string; status: string };
  closing: { stages: Stage[]; current: string; description: string; closingDate: string | null } | null;
  facts: { label: string; value: string }[];
  parties: { role: string; name: string; company?: string }[];
  toSign: { id: string; title: string; sentAt: string }[];
};

const fmtDate = (ymd: string | null) => (ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
const fmtLong = (ymd: string) => (/^\d{4}-\d{2}-\d{2}$/.test(ymd) ? new Date(`${ymd}T12:00:00`).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : ymd);

// The client's page for one matter: where things stand, who is involved, what to sign, messages.
export default function PortalMatterPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portal/matters/${id}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (r.status === 401) {
          router.push("/portal/login");
          return null;
        }
        if (!r.ok) throw new Error(d?.error ?? "This page couldn't be loaded.");
        return d as View;
      })
      .then((d) => d && setView(d))
      .catch((e: Error) => setError(e.message));
  }, [id, router]);

  async function sign(requestId: string) {
    setSigning(requestId);
    try {
      const r = await fetch(`/api/portal/sign/${requestId}`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? "The document couldn't be opened.");
      router.push(d.url);
    } catch (e) {
      setError((e as Error).message);
      setSigning(null);
    }
  }

  if (error && !view)
    return (
      <div className="max-w-[1000px] mx-auto px-5 py-10">
        <Link href="/portal" className="inline-flex items-center gap-1.5 text-[13.5px] text-muted hover:text-ink mb-4">
          <ArrowLeft size={14} /> Back
        </Link>
        <div className="flex items-start gap-2 rounded-xl bg-[#FDF1E7] text-[#8A4B14] px-4 py-3 text-[14px]">
          <AlertTriangle size={16} className="mt-0.5" /> {error}
        </div>
      </div>
    );
  if (!view)
    return (
      <div className="max-w-[1000px] mx-auto px-5 py-16 flex items-center gap-2 text-muted text-[14px]">
        <Loader2 size={16} className="animate-spin" /> Loading…
      </div>
    );

  const address = view.facts.find((f) => f.label === "Property address")?.value;
  const stages = (view.closing?.stages ?? []).filter((s) => s.state !== "skipped");
  const doneCount = stages.filter((s) => s.state === "done").length;
  const progress = stages.length > 1 ? Math.min(100, ((doneCount + (stages.some((s) => s.state === "current") ? 0.5 : 0) - 0.5) / (stages.length - 1)) * 100) : 0;

  return (
    <div className="max-w-[1000px] mx-auto px-5 pb-16">
      <Link href="/portal" className="inline-flex items-center gap-1.5 text-[13.5px] text-muted hover:text-ink mt-6 mb-4">
        <ArrowLeft size={14} /> All my files
      </Link>

      {/* Header */}
      <div className="rounded-3xl bg-[#E9EEF7] px-6 py-8 text-center mb-6">
        <span className="inline-block text-[12px] font-semibold bg-ink text-white rounded-md px-2 py-0.5 mb-3">{view.matter.kind}</span>
        <h1 className="text-[26px] font-semibold leading-tight">{address || view.matter.title}</h1>
        {view.matter.number && <div className="text-[13.5px] text-muted mt-1.5">File #{view.matter.number}</div>}
      </div>

      {/* Closing status */}
      {view.closing && (
        <section className="border border-line rounded-2xl bg-page p-6 mb-6">
          <h2 className="flex items-center gap-2 text-[17px] font-semibold mb-6">
            <TrendingUp size={18} strokeWidth={1.75} /> Closing status
          </h2>
          <div className="relative mx-2 mb-2">
            <div className="h-2.5 rounded-full bg-card-alt" />
            <div className="absolute left-0 top-0 h-2.5 rounded-full bg-ink" style={{ width: `${Math.max(0, progress)}%` }} />
            {stages.map((s, i) => (
              <span
                key={s.key}
                className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full border-2 flex items-center justify-center ${s.state === "done" ? "bg-ink border-ink" : s.state === "current" ? "bg-white border-ink" : "bg-white border-line"}`}
                style={{ left: `${(i / (stages.length - 1)) * 100}%` }}
              >
                {s.star && <Star size={10} className={s.state === "done" ? "text-white" : "text-[#C99A2E]"} fill="currentColor" />}
              </span>
            ))}
          </div>
          <div className="grid mt-4 gap-2" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
            {stages.map((s, i) => (
              <div key={s.key} className={`text-[12.5px] ${i === 0 ? "text-left" : i === stages.length - 1 ? "text-right" : "text-center"}`}>
                <div className={s.state === "current" ? "font-semibold" : s.state === "upcoming" ? "text-muted" : "font-medium"}>{s.label}</div>
                {s.date && <div className={`text-[12px] ${s.star ? "text-[#B07D1A]" : "text-muted"}`}>{fmtDate(s.date)}</div>}
              </div>
            ))}
          </div>
          <div className="text-center mt-7">
            <div className="text-[16px] font-semibold">
              Your file is <span className="text-[#1F7A44]">{view.matter.status === "Closed" ? "closed" : "on track"}</span>
            </div>
            <div className="text-[13.5px] text-muted">Current stage: {view.closing.current}</div>
            <p className="text-[14px] text-muted max-w-[600px] mx-auto mt-3">{view.closing.description}</p>
          </div>
        </section>
      )}

      {/* Documents to sign */}
      {view.toSign.length > 0 && (
        <section className="border border-[#F6D4A6] bg-[#FFF8EE] rounded-2xl p-5 mb-6">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold mb-3">
            <PenLine size={17} strokeWidth={1.75} /> Waiting for your signature
          </h2>
          <div className="flex flex-col gap-2">
            {view.toSign.map((d) => (
              <div key={d.id} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3">
                <span className="flex-1 min-w-0 text-[14px] font-medium truncate">{d.title}</span>
                <button
                  onClick={() => void sign(d.id)}
                  disabled={!!signing}
                  className="flex items-center gap-1.5 bg-ink text-white px-4 py-1.5 rounded-full text-[13px] font-medium disabled:opacity-60"
                >
                  {signing === d.id && <Loader2 size={13} className="animate-spin" />} Review &amp; sign
                </button>
              </div>
            ))}
          </div>
          {error && <div className="text-[13px] text-[#B42318] mt-2">{error}</div>}
        </section>
      )}

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <section className="border border-line rounded-2xl bg-page p-5">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold mb-3">
            <Building2 size={17} strokeWidth={1.75} /> {view.firm}
          </h2>
          <dl className="divide-y divide-line">
            {view.facts.map((f) => (
              <div key={f.label} className="flex gap-4 py-2 text-[13.5px]">
                <dt className="w-[170px] flex-shrink-0 text-muted uppercase text-[11.5px] font-semibold tracking-wide pt-0.5">{f.label}</dt>
                <dd className={f.value ? "" : "text-muted"}>{f.value ? fmtLong(f.value) : "Not specified"}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="border border-line rounded-2xl bg-page p-5">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold mb-3">
            <Users size={17} strokeWidth={1.75} /> Parties
          </h2>
          {view.parties.length === 0 ? (
            <p className="text-[13.5px] text-muted">The parties will appear here as your file progresses.</p>
          ) : (
            <dl className="divide-y divide-line">
              {view.parties.map((p, i) => (
                <div key={i} className="flex gap-4 py-2 text-[13.5px]">
                  <dt className="w-[150px] flex-shrink-0 text-muted uppercase text-[11.5px] font-semibold tracking-wide pt-0.5">{p.role}</dt>
                  <dd>
                    {p.name}
                    {p.company && <span className="block text-[12.5px] text-muted">{p.company}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>

      {/* Messages and files for this matter */}
      <PortalMessages firm={view.firm} matters={[{ id: view.matter.id, title: "Messages about this file" }]} onlyMatters />
    </div>
  );
}
