"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Merge, Search, X } from "lucide-react";
import { pageBtnB, pageBtnOpenB, smallBtnB } from "@/lib/ui";
import { numberOf, type Matter } from "@/components/NewMatterModal";
import type { Client } from "@/components/NewClientModal";
import type { Contact } from "@/lib/records/contactTypes";

// Merge duplicates: suggested pairs (same name, same matter number) or two
// records picked by hand. Everything on the removed record moves to the one
// kept (documents, tasks, emails, texts, time, invoices, people), its empty
// details are filled in from the other, and the duplicate is removed.

export type MergeKind = "clients" | "contacts" | "matters";
type Rec = { id: string; name: string; lines: string[]; score: number; updatedAt: string };

const KIND_LABEL: Record<MergeKind, string> = { clients: "Client cards", contacts: "Contacts", matters: "Matters" };
const NOUN: Record<MergeKind, string> = { clients: "client card", contacts: "contact", matters: "matter" };
const IGNORE_KEY = "lp-merge-not-duplicates";

// "Ms. Kim Walsh" = "Kim Walsh" = "Walsh, Kim"; "Title Co." = "Title Company".
const STOP = new Set(["mr", "mrs", "ms", "miss", "dr", "esq", "jr", "sr", "the", "llc", "inc", "co", "company", "corp", "llp", "pc", "ltd"]);
export function nameKey(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ąćęłńóśźż\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .sort()
    .join(" ");
}

function readIgnored(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(IGNORE_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export default function MergeDuplicatesModal({
  clients,
  matters,
  contacts: givenContacts,
  initial,
  onClose,
  onMerged,
}: {
  clients: Client[];
  matters: Matter[];
  contacts?: Contact[];
  initial?: { kind: MergeKind; id: string };
  onClose: () => void;
  onMerged: (kind: MergeKind, keepId: string, dropIds: string[]) => void;
}) {
  const [mode, setMode] = useState<"suggested" | "manual">(initial ? "manual" : "suggested");
  const [kind, setKind] = useState<MergeKind>(initial?.kind ?? "clients");
  const [fetched, setFetched] = useState<Contact[] | null>(null);
  const contacts = givenContacts ?? fetched;
  const [ignored, setIgnored] = useState<string[]>(readIgnored); // the window opens on a click, so this runs in the browser
  const [gone, setGone] = useState<string[]>([]); // merged away in this window
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (givenContacts || kind !== "contacts" || fetched) return;
    fetch("/api/contacts")
      .then((r) => (r.ok ? r.json() : { contacts: [] }))
      .then((d) => setFetched((d.contacts ?? []) as Contact[]))
      .catch(() => setFetched([]));
  }, [givenContacts, kind, fetched]);

  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  const records = useMemo<Record<MergeKind, Rec[]>>(() => {
    const filled = (...v: (string | null | undefined)[]) => v.filter((x) => x && String(x).trim()).length;
    const goneSet = new Set(gone);
    const mattersOf = new Map<string, number>();
    for (const m of matters) if (m.clientId) mattersOf.set(m.clientId, (mattersOf.get(m.clientId) ?? 0) + 1);
    return {
      clients: clients
        .filter((c) => !goneSet.has(c.id))
        .map((c) => {
          const n = mattersOf.get(c.id) ?? 0;
          return {
            id: c.id,
            name: c.name,
            lines: [c.type, c.email ?? "", c.phone ?? "", `${n} ${n === 1 ? "matter" : "matters"}`].filter(Boolean),
            score: filled(c.email, c.phone, c.address, c.description) + n * 2,
            updatedAt: c.updatedAt,
          };
        }),
      contacts: (contacts ?? [])
        .filter((c) => !goneSet.has(c.id))
        .map((c) => ({
          id: c.id,
          name: c.name,
          lines: [c.kind === "person" ? "Person" : c.kind === "company" ? "Company" : c.kind, c.role, c.company, c.email ?? "", c.phone ?? c.mobile ?? "", [c.city, c.state].filter(Boolean).join(", ")].filter(Boolean),
          score: filled(c.email, c.phone, c.mobile, c.address, c.city, c.role, c.company, c.notes),
          updatedAt: c.updatedAt,
        })),
      matters: matters
        .filter((m) => !goneSet.has(m.id))
        .map((m) => ({
          id: m.id,
          name: m.title,
          lines: [m.matterNumber ? m.matterNumber : "No matter number", clientName.get(m.clientId ?? "") ?? "No client", m.status, m.category && m.category !== "None" ? m.category : ""].filter(Boolean),
          score: filled(m.matterNumber, m.clientId, m.description, m.category) + (m.status === "Closed" ? 0 : 1),
          updatedAt: m.updatedAt,
        })),
    };
  }, [clients, contacts, matters, clientName, gone]);

  // Suggested duplicates: same name (any order, without Mr./Ms./LLC…) or, for matters, the same matter number.
  const groups = useMemo<Record<MergeKind, { key: string; recs: Rec[] }[]>>(() => {
    const kindOf = new Map((contacts ?? []).map((c) => [c.id, c.kind]));
    const byKey = (list: Rec[], keyOf: (r: Rec) => string | null) => {
      const m = new Map<string, Rec[]>();
      for (const r of list) {
        const k = keyOf(r);
        if (!k || k.length < 3) continue;
        m.set(k, [...(m.get(k) ?? []), r]);
      }
      return [...m.entries()]
        .filter(([k, v]) => v.length > 1 && !ignored.includes(k))
        .map(([key, recs]) => ({ key, recs: [...recs].sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt)) }))
        .sort((a, b) => a.recs[0].name.localeCompare(b.recs[0].name));
    };
    const matterById = new Map(matters.map((m) => [m.id, m]));
    return {
      clients: byKey(records.clients, (r) => `client:${nameKey(r.name)}`),
      contacts: byKey(records.contacts, (r) => `${kindOf.get(r.id) ?? ""}:${nameKey(r.name)}`),
      matters: byKey(records.matters, (r) => {
        const m = matterById.get(r.id);
        const num = m ? numberOf(m) : null;
        return num ? `matter:${num}` : `matter-title:${nameKey(r.name)}`;
      }),
    };
  }, [records, contacts, matters, ignored]);

  async function merge(k: MergeKind, keep: Rec, drops: Rec[], groupKey: string) {
    const msg =
      drops.length === 1
        ? `Merge “${drops[0].name}” into “${keep.name}”?`
        : `Merge ${drops.length} duplicates into “${keep.name}”?`;
    if (!confirm(`${msg}\n\nEverything on the other ${NOUN[k]} (documents, tasks, emails, texts, time, invoices and people) moves to the one you keep, and its empty details are filled in. The duplicate is then removed. This can't be undone.`)) return;
    setBusy(groupKey);
    setError(null);
    setDone(null);
    const merged: string[] = [];
    let moved = 0;
    try {
      for (const d of drops) {
        const res = await fetch("/api/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: k, keepId: keep.id, dropId: d.id }) });
        const body = (await res.json().catch(() => ({}))) as { error?: string; moved?: number };
        if (!res.ok) throw new Error(body.error ?? "The records couldn't be merged. Please try again.");
        merged.push(d.id);
        moved += body.moved ?? 0;
      }
      setDone(`Merged into “${keep.name}”${moved ? `: ${moved} ${moved === 1 ? "item" : "items"} moved over` : ""}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (merged.length) {
        setGone((g) => [...g, ...merged]);
        if (k === "contacts") setFetched((list) => list?.filter((c) => !merged.includes(c.id)) ?? list);
        onMerged(k, keep.id, merged);
      }
      setBusy(null);
    }
  }

  function notDuplicates(key: string) {
    const next = [...ignored, key];
    setIgnored(next);
    try {
      localStorage.setItem(IGNORE_KEY, JSON.stringify(next));
    } catch {
      /* not saved: it shows again next time */
    }
  }

  const list = groups[kind];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-8" onClick={() => !busy && onClose()}>
      <div className="bg-cream rounded-2xl w-full max-w-[760px] max-h-full overflow-y-auto p-7" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-[20px] font-semibold">Merge duplicates</h2>
          <button onClick={onClose} disabled={!!busy} className="text-muted hover:text-ink disabled:opacity-40" aria-label="Close">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <p className="text-[13.5px] text-muted mb-5 max-w-[620px]">
          Choose the one to keep. Everything on the other moves to it, and its empty details are filled in from the other. The duplicate is then removed.
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button onClick={() => setMode("suggested")} className={mode === "suggested" ? pageBtnOpenB : pageBtnB}>
            Suggested duplicates
          </button>
          <button onClick={() => setMode("manual")} className={mode === "manual" ? pageBtnOpenB : pageBtnB}>
            Pick two yourself
          </button>
          <span className="w-px h-5 bg-line mx-1" />
          {(Object.keys(KIND_LABEL) as MergeKind[]).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={kind === k ? pageBtnOpenB : pageBtnB}>
              {KIND_LABEL[k]}
              {mode === "suggested" && (k !== "contacts" || contacts) && groups[k].length > 0 && <span className="text-muted">{groups[k].length}</span>}
            </button>
          ))}
        </div>

        {error && <div className="mb-3 rounded-xl bg-[#FDECEC] text-[#B42318] text-[13.5px] px-3.5 py-2.5">{error}</div>}
        {done && (
          <div className="mb-3 rounded-xl bg-[#E8F6EE] text-[#1F7A4D] text-[13.5px] px-3.5 py-2.5 flex items-center gap-2">
            <Check size={14} strokeWidth={2.5} /> {done}
          </div>
        )}

        {mode === "suggested" ? (
          kind === "contacts" && !contacts ? (
            <div className="flex items-center gap-2 text-[14px] text-muted py-10 justify-center">
              <Loader2 size={15} className="animate-spin" /> Looking for duplicates…
            </div>
          ) : list.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-[15px] font-semibold mb-1">No duplicate {KIND_LABEL[kind].toLowerCase()} found</div>
              <p className="text-[13.5px] text-muted">If two records are the same but named differently, use Pick two yourself.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {list.map((g) => (
                <Group key={g.key} kind={kind} recs={g.recs} busy={busy === g.key} disabled={!!busy} onMerge={(keep, drops) => void merge(kind, keep, drops, g.key)} onIgnore={() => notDuplicates(g.key)} />
              ))}
            </div>
          )
        ) : (
          <Manual
            key={kind}
            kind={kind}
            recs={records[kind]}
            loading={kind === "contacts" && !contacts}
            initialId={initial?.kind === kind ? initial.id : null}
            busy={busy === "manual"}
            onMerge={(keep, drop) => void merge(kind, keep, [drop], "manual")}
          />
        )}
      </div>
    </div>
  );
}

function RecRow({ r, keep, onKeep }: { r: Rec; keep: boolean; onKeep: () => void }) {
  return (
    <label className={`flex items-start gap-3 rounded-xl px-3 py-2.5 cursor-pointer border transition-colors ${keep ? "bg-white border-[#C4C0B8]" : "bg-[#FCFCFC] border-[#EBEAE7] hover:border-[#DCDAD5]"}`}>
      <input type="radio" checked={keep} onChange={onKeep} className="mt-1 accent-[#1b191a]" />
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-[14px] font-medium truncate">{r.name}</span>
          {keep ? (
            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-[#E8F6EE] text-[#1F7A4D] flex-shrink-0">Keep</span>
          ) : (
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-[#FDECEC] text-[#B42318] flex-shrink-0">Merge in &amp; remove</span>
          )}
        </span>
        <span className="block text-[12.5px] text-muted truncate">{r.lines.join(" · ")}</span>
      </span>
    </label>
  );
}

function Group({ kind, recs, busy, disabled, onMerge, onIgnore }: { kind: MergeKind; recs: Rec[]; busy: boolean; disabled: boolean; onMerge: (keep: Rec, drops: Rec[]) => void; onIgnore: () => void }) {
  const [keepId, setKeepId] = useState(recs[0].id);
  const keep = recs.find((r) => r.id === keepId) ?? recs[0];
  return (
    <div className="bg-[#F3F2F0] border border-[#E8E6E2] rounded-2xl p-2.5">
      <div className="flex flex-col gap-1.5">
        {recs.map((r) => (
          <RecRow key={r.id} r={r} keep={r.id === keep.id} onKeep={() => setKeepId(r.id)} />
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2.5 px-0.5">
        <button onClick={() => onMerge(keep, recs.filter((r) => r.id !== keep.id))} disabled={disabled} className={`${pageBtnB} disabled:opacity-60`}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Merge size={14} />}
          {busy ? "Merging…" : `Merge ${recs.length === 2 ? `the two ${NOUN[kind]}s` : `all ${recs.length}`}`}
        </button>
        <button onClick={onIgnore} disabled={disabled} className={`${smallBtnB} ml-auto disabled:opacity-60`}>
          Not duplicates
        </button>
      </div>
    </div>
  );
}

function Picker({ label, recs, value, exclude, onPick }: { label: string; recs: Rec[]; value: Rec | null; exclude: string | null; onPick: (r: Rec | null) => void }) {
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? recs.filter((r) => r.id !== exclude && words.every((w) => `${r.name} ${r.lines.join(" ")}`.toLowerCase().includes(w))).slice(0, 8) : [];
  return (
    <div className="flex-1 min-w-[240px]">
      <div className="text-[12.5px] text-muted mb-1.5">{label}</div>
      {value ? (
        <div className="flex items-center gap-2 bg-white border border-[#E6E4E0] rounded-xl px-3 py-2">
          <span className="flex-1 min-w-0">
            <span className="block text-[13.5px] font-medium truncate">{value.name}</span>
            <span className="block text-[12px] text-muted truncate">{value.lines.join(" · ")}</span>
          </span>
          <button onClick={() => onPick(null)} className="text-muted hover:text-ink" aria-label="Close">
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="bg-[#F3F2F0] border border-[#E8E6E2] rounded-full p-1">
            <div className="flex items-center gap-2 bg-white rounded-full px-3 py-1.5">
              <Search size={14} className="text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or number" className="flex-1 outline-none text-[13.5px] bg-transparent" />
            </div>
          </div>
          {hits.length > 0 && (
            <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 bg-white border border-line rounded-2xl p-1.5 max-h-[260px] overflow-y-auto">
              {hits.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    onPick(r);
                    setQ("");
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-chip"
                >
                  <span className="block text-[13.5px] font-medium truncate">{r.name}</span>
                  <span className="block text-[12px] text-muted truncate">{r.lines.join(" · ")}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Manual({ kind, recs, loading, initialId, busy, onMerge }: { kind: MergeKind; recs: Rec[]; loading: boolean; initialId: string | null; busy: boolean; onMerge: (keep: Rec, drop: Rec) => void }) {
  const [aId, setAId] = useState<string | null>(initialId);
  const [bId, setBId] = useState<string | null>(null);
  const [keepId, setKeepId] = useState<string | null>(initialId);
  const a = recs.find((r) => r.id === aId) ?? null;
  const b = recs.find((r) => r.id === bId) ?? null;
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[14px] text-muted py-10 justify-center">
        <Loader2 size={15} className="animate-spin" /> Loading…
      </div>
    );
  }
  const keep = a && b ? (keepId === b.id ? b : a) : null;
  const drop = a && b ? (keep === a ? b : a) : null;
  return (
    <div className="bg-[#F3F2F0] border border-[#E8E6E2] rounded-2xl p-3">
      <div className="flex flex-wrap gap-3">
        <Picker label={`First ${NOUN[kind]}`} recs={recs} value={a} exclude={bId} onPick={(r) => setAId(r?.id ?? null)} />
        <Picker label={`Second ${NOUN[kind]}`} recs={recs} value={b} exclude={aId} onPick={(r) => setBId(r?.id ?? null)} />
      </div>
      {a && b && keep && drop && (
        <>
          <div className="text-[12.5px] text-muted mt-4 mb-1.5">Which one do you keep?</div>
          <div className="flex flex-col gap-1.5">
            <RecRow r={a} keep={keep.id === a.id} onKeep={() => setKeepId(a.id)} />
            <RecRow r={b} keep={keep.id === b.id} onKeep={() => setKeepId(b.id)} />
          </div>
          <button onClick={() => onMerge(keep, drop)} disabled={busy} className={`${pageBtnB} mt-3 disabled:opacity-60`}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Merge size={14} />}
            {busy ? "Merging…" : `Merge into “${keep.name.length > 40 ? `${keep.name.slice(0, 40)}…` : keep.name}”`}
          </button>
        </>
      )}
    </div>
  );
}
