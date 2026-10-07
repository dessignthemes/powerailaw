"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, ChevronRight } from "lucide-react";
import ClientAvatar from "@/components/clientCard/ClientAvatar";
import ClientCardEditor from "@/components/clientCard/ClientCardEditor";

type Card = { id: string; name: string; cardType: "person" | "company"; email: string | null; phone: string | null; status: string; updatedAt: string; hasPhoto?: boolean };

export default function ClientIntakePage() {
  return (
    <Suspense fallback={<div className="px-10 py-10 text-[14px] text-muted">Loading…</div>}>
      <ClientIntake />
    </Suspense>
  );
}

function ClientIntake() {
  const router = useRouter();
  const params = useSearchParams();
  const open = params.get("card"); // "new" or a client id
  const [cards, setCards] = useState<Card[] | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | "person" | "company">("all");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/client-cards")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw Object.assign(new Error(d?.error ?? "Couldn't load clients."), { code: d?.code });
        return d.cards as Card[];
      })
      .then((c) => !cancelled && (setCards(c), setError(null), setSetup(false)))
      .catch((e: Error & { code?: string }) => {
        if (cancelled) return;
        if (e.code === "setup_required") setSetup(true);
        else setError(e.message);
        setCards([]);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (cards ?? []).filter(
      (c) => (type === "all" || c.cardType === type) && words.every((w) => `${c.name} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(w))
    );
  }, [cards, q, type]);

  const go = (card: string | null) => router.push(card ? `/dashboard/client-intake?card=${card}` : "/dashboard/client-intake");

  return (
    <div className="px-10 py-10">
      {open ? (
        <ClientCardEditor
          key={open}
          id={open === "new" ? null : open}
          onClose={() => { setReload((n) => n + 1); go(null); }}
          onSaved={(id) => { if (open === "new") router.replace(`/dashboard/client-intake?card=${id}`); }}
        />
      ) : (
        <>
          <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
            <div>
              <h1 className="text-[28px] font-semibold">Client Intake</h1>
              <p className="text-[14.5px] text-muted mt-1">Onboard new clients with a complete client card: people, contact details, address, notes, documents, mailings and matters.</p>
            </div>
            <button onClick={() => go("new")} disabled={setup} className="bg-btn hover:bg-btn-hover px-4 py-2 rounded-full text-[13.5px] font-medium transition-colors disabled:opacity-50">
              + New client
            </button>
          </div>

          {setup && (
            <div className="my-5 rounded-xl border border-line bg-card-alt px-4 py-3 text-[13.5px]">
              Client cards need a one-time database update. Run <span className="font-medium">supabase/migrations/0018_client_cards.sql</span> in the Supabase SQL editor, then refresh.
            </div>
          )}
          {error && <div className="my-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">{error}</div>}

          <div className="flex items-center gap-3 mt-6 mb-5 flex-wrap">
            <div className="relative flex-1 min-w-[240px] max-w-[420px]">
              <Search size={15} strokeWidth={1.75} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email or phone" aria-label="Search clients" className="w-full border border-line bg-white rounded-full pl-10 pr-9 py-2.5 text-[13.5px] outline-none focus:border-ink placeholder:text-muted" />
              {q && <button onClick={() => setQ("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"><X size={14} /></button>}
            </div>
            <div className="flex gap-1.5">
              {([["all", "All"], ["person", "People"], ["company", "Companies"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setType(k)} className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium ${type === k ? "bg-btn ring-1 ring-inset ring-btn-ring" : "bg-card-alt hover:bg-line/70"}`}>{l}</button>
              ))}
            </div>
          </div>

          <div className="bg-card-alt rounded-2xl p-2">
            {cards === null ? (
              <div className="bg-cream rounded-xl py-14 text-center text-[14px] text-muted">Loading clients…</div>
            ) : shown.length === 0 ? (
              <div className="bg-cream rounded-xl py-14 text-center">
                <div className="text-[14.5px] font-medium">{q ? `No clients match “${q.trim()}”` : "No clients yet"}</div>
                {!q && !setup && <button onClick={() => go("new")} className="bg-btn hover:bg-btn-hover px-4 py-2 rounded-full text-[13.5px] font-medium mt-4">+ New client</button>}
              </div>
            ) : (
              <div className="bg-cream rounded-xl divide-y divide-line">
                {shown.map((c) => (
                  <button key={c.id} onClick={() => go(c.id)} className="w-full flex items-center gap-3.5 px-5 py-3.5 text-left hover:bg-card-alt/50 first:rounded-t-xl last:rounded-b-xl">
                    <ClientAvatar
                      name={c.name}
                      company={c.cardType === "company"}
                      src={c.hasPhoto ? `/api/client-cards/${c.id}/photo?v=${encodeURIComponent(c.updatedAt)}` : null}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14.5px] font-medium truncate">{c.name}</span>
                      <span className="block text-[12.5px] text-muted truncate">
                        {[c.cardType === "company" ? "Company" : "Person", c.email, c.phone, c.status === "Archived" ? "Archived" : ""].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="text-[12.5px] text-muted hidden sm:block">{new Date(c.updatedAt).toLocaleDateString()}</span>
                    <ChevronRight size={16} className="text-muted" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
