"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, ShieldCheck, ShieldAlert, ShieldQuestion, Search, Plus, ChevronDown, Archive, ArchiveRestore } from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import { displayName } from "@/lib/initials";
import type { ConflictCheck, ConflictHit } from "@/lib/conflicts/check";
import RunConflictModal from "@/components/conflicts/RunConflictModal";

// Conflict checks: every new client is checked against all of the firm's
// matters (leads, open and closed). Run one by hand for a prospect before
// taking them on. Each check is reviewed and marked Cleared or Conflict.

type Tab = "review" | "clear" | "conflict" | "archived";

const tabOf = (c: ConflictCheck): Tab =>
  c.archived ? "archived" : c.decision === "conflict" ? "conflict" : c.decision === "cleared" || c.result === "clear" ? "clear" : "review";

const VERDICT: Record<ConflictHit["verdict"], { label: string; cls: string }> = {
  adverse: { label: "Other side", cls: "bg-[#FDECEC] text-[#9F1D1D]" },
  related: { label: "Involved", cls: "bg-[#FFF4E5] text-[#8A4B14]" },
  same_side: { label: "Our client's side", cls: "bg-[#F1F7EF] text-[#2F5E2A]" },
};

function StatusPill({ c }: { c: ConflictCheck }) {
  const t = tabOf(c);
  const meta =
    c.decision === "cleared"
      ? { text: "Cleared", cls: "bg-[#F1F7EF] text-[#2F5E2A]", Icon: ShieldCheck }
      : c.decision === "conflict"
        ? { text: "Conflict", cls: "bg-[#FDECEC] text-[#9F1D1D]", Icon: ShieldAlert }
        : c.result === "clear"
          ? { text: "No conflicts", cls: "bg-[#F1F7EF] text-[#2F5E2A]", Icon: ShieldCheck }
          : c.result === "conflict"
            ? { text: "Likely conflict", cls: "bg-[#FDECEC] text-[#9F1D1D]", Icon: ShieldAlert }
            : { text: "Needs review", cls: "bg-[#FFF4E5] text-[#8A4B14]", Icon: ShieldQuestion };
  void t;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold whitespace-nowrap ${meta.cls}`}>
      <meta.Icon size={13} /> {meta.text}
    </span>
  );
}

function CheckRow({ c, open, onToggle, onChange, person, clientName }: { c: ConflictCheck; open: boolean; onToggle: () => void; onChange: (c: ConflictCheck) => void; person: (id: string | null) => string; clientName: string | null }) {
  const [note, setNote] = useState(c.decisionNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { matters } = useWorkspaceData();
  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/conflicts/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = (await r.json().catch(() => ({}))) as { check?: ConflictCheck; error?: string };
      if (!r.ok || !d.check) throw new Error(d.error ?? "Couldn't save.");
      onChange(d.check);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const searchedLine = [...c.searched.names, ...c.searched.companies, ...c.searched.emails, ...c.searched.phones].filter((v, i, a) => a.indexOf(v) === i).join(" · ");
  return (
    <div id={`check-${c.id}`} className="border-b border-line last:border-b-0">
      <button onClick={onToggle} className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-[#F7F9FC]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14.5px] font-semibold">{c.label}</span>
            {clientName && <span className="text-[12px] text-muted">· new client</span>}
          </div>
          <div className="text-[13px] text-muted line-clamp-2">{c.summary}</div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {c.hits.length > 0 && <span className="text-[12.5px] text-muted whitespace-nowrap">{c.hits.length} {c.hits.length === 1 ? "match" : "matches"}</span>}
          <StatusPill c={c} />
          <span className="text-[12.5px] text-muted w-[64px] text-right">{new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          <ChevronDown size={16} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && (
        <div className="px-5 pb-5">
          <div className="text-[12.5px] text-muted mb-3">
            Checked: <span className="text-ink">{searchedLine || "—"}</span> · against {c.mattersChecked} matters (every status) and client records · by {person(c.createdBy)}
            {!c.aiUsed && c.hits.length > 0 && " · AI review wasn't available, so these are name matches only"}
            {c.clientId && (
              <>
                {" · "}
                <Link href={`/dashboard/client-intake?card=${c.clientId}`} className="underline underline-offset-2 text-ink">
                  Open client card
                </Link>
              </>
            )}
          </div>
          {c.hits.length > 0 ? (
            <div className="border border-line rounded-xl bg-white overflow-x-auto mb-4">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead className="bg-cream border-b border-line">
                  <tr>
                    {["Matter", "Name on file", "Role", "Side", "Why"].map((h) => (
                      <th key={h} className="text-left text-[12px] font-semibold text-muted px-3 py-2">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {c.hits.map((h, i) => {
                    const m = h.matterId ? matters.find((x) => x.id === h.matterId) : null;
                    return (
                      <tr key={i} className="align-top">
                        <td className="px-3 py-2.5">
                          {h.matterId ? (
                            <Link href={`/dashboard/matters/${h.matterId}`} className="font-medium hover:underline underline-offset-2">
                              {h.matterNumber ?? m?.matterNumber ?? h.matterTitle}
                            </Link>
                          ) : (
                            <span className="text-muted">Client record</span>
                          )}
                          {h.matterId && <div className="text-[12px] text-muted">{[h.matterNumber ? h.matterTitle : null, h.matterStatus].filter(Boolean).join(" · ")}</div>}
                        </td>
                        <td className="px-3 py-2.5">
                          {h.name || <span className="text-muted">(in the title)</span>}
                          <div className="text-[12px] text-muted">{h.match === "likely" ? "Likely the same" : "Possibly the same"}</div>
                        </td>
                        <td className="px-3 py-2.5">{h.role}</td>
                        <td className="px-3 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap ${VERDICT[h.verdict].cls}`}>{VERDICT[h.verdict].label}</span>
                        </td>
                        <td className="px-3 py-2.5 text-muted max-w-[320px]">{h.reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl bg-white border border-line px-4 py-3 text-[13px] text-muted mb-4">Nothing similar was found in any matter or client record.</div>
          )}

          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[260px]">
              <label className="block text-[12.5px] font-semibold text-muted mb-1">Note</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional, e.g. different person (checked date of birth)" className="w-full bg-white border border-line rounded-xl px-3.5 py-2 text-[13.5px] outline-none focus:border-btn-ring" />
            </div>
            <button onClick={() => patch({ decision: "cleared", note })} disabled={busy} className={`px-4 py-2 rounded-full text-[13px] font-medium flex items-center gap-1.5 disabled:opacity-50 ${c.decision === "cleared" ? "bg-[#2F5E2A] text-white" : "bg-[#F1F7EF] text-[#2F5E2A] hover:bg-[#E2EFDD]"}`}>
              <ShieldCheck size={14} /> {c.decision === "cleared" ? "Cleared" : "Mark cleared"}
            </button>
            <button onClick={() => patch({ decision: "conflict", note })} disabled={busy} className={`px-4 py-2 rounded-full text-[13px] font-medium flex items-center gap-1.5 disabled:opacity-50 ${c.decision === "conflict" ? "bg-[#9F1D1D] text-white" : "bg-[#FDECEC] text-[#9F1D1D] hover:bg-[#F9DCDC]"}`}>
              <ShieldAlert size={14} /> {c.decision === "conflict" ? "Conflict" : "Mark as conflict"}
            </button>
            <button onClick={() => patch({ archived: !c.archived })} disabled={busy} title={c.archived ? "Move back" : "Archive"} aria-label={c.archived ? "Move back" : "Archive"} className="w-9 h-9 rounded-full bg-chip hover:bg-btn flex items-center justify-center disabled:opacity-50">
              {c.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
            </button>
          </div>
          {c.decision && (
            <div className="text-[12px] text-muted mt-2">
              {c.decision === "cleared" ? "Cleared" : "Marked as a conflict"} by {person(c.decidedBy)}
              {c.decidedAt ? ` on ${new Date(c.decidedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
              {" · "}
              <button onClick={() => patch({ decision: null })} className="underline underline-offset-2">
                Undo
              </button>
            </div>
          )}
          {error && <div className="mt-2 text-[13px] text-[#9F1D1D]">{error}</div>}
        </div>
      )}
    </div>
  );
}

function ConflictChecksInner() {
  const params = useSearchParams();
  const focus = params.get("check");
  const { teamMembers, clients } = useWorkspaceData();
  const [checks, setChecks] = useState<ConflictCheck[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(focus);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetch("/api/conflicts")
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as { checks?: ConflictCheck[]; error?: string };
        if (!r.ok) throw new Error(d.error ?? "Couldn't load conflict checks.");
        setChecks(d.checks ?? []);
      })
      .catch((e: Error) => {
        setError(e.message);
        setChecks([]);
      });
  }, []);

  // Opened from a client card: show that check's tab and scroll to it.
  const focused = focus && checks ? checks.find((c) => c.id === focus) : null;
  const activeTab: Tab = tab ?? (focused ? tabOf(focused) : "review");
  useEffect(() => {
    if (focused) document.getElementById(`check-${focused.id}`)?.scrollIntoView({ block: "center" });
  }, [focused]);

  const person = (id: string | null) => {
    const m = id ? teamMembers.find((x) => x.id === id) : null;
    return m ? displayName(m.fullName, m.email) : "LawPower";
  };
  const counts = useMemo(() => {
    const c = { review: 0, clear: 0, conflict: 0, archived: 0 };
    for (const x of checks ?? []) c[tabOf(x)]++;
    return c;
  }, [checks]);
  const shown = (checks ?? []).filter((c) => tabOf(c) === activeTab && (!q.trim() || `${c.label} ${c.summary} ${c.hits.map((h) => `${h.name} ${h.matterNumber} ${h.matterTitle}`).join(" ")}`.toLowerCase().includes(q.trim().toLowerCase())));
  const update = (c: ConflictCheck) => setChecks((list) => (list ?? []).map((x) => (x.id === c.id ? c : x)));

  return (
    <div className="px-10 py-10 max-w-[1150px]">
      <div className="flex items-start justify-between gap-4 mb-1 flex-wrap">
        <div>
          <Link href="/dashboard/records" className="text-[13px] text-muted hover:text-ink">
            ← Contacts
          </Link>
          <h1 className="text-[28px] font-semibold">Conflict Checks</h1>
        </div>
        <button onClick={() => setRunning(true)} className="bg-btn hover:bg-btn-hover text-ink px-4 py-2.5 rounded-full text-[13.5px] font-medium flex items-center gap-1.5">
          <Plus size={15} /> Run conflict check
        </button>
      </div>
      <p className="text-[14.5px] text-muted mb-6 max-w-[820px]">
        Checks a client or prospect against all of the firm&apos;s matters, whatever their status (leads, open and closed): clients, the other side,
        attorneys, realtors and matter contacts. The AI reviews the matches and flags anyone who was on the other side. Run it from a client card or with the button above.
      </p>

      <div className="flex items-center justify-between gap-4 border-b border-line mb-5 flex-wrap">
        <div className="flex items-center gap-6" role="tablist">
          {(
            [
              ["review", "Needs review"],
              ["clear", "Clear"],
              ["conflict", "Conflicts"],
              ["archived", "Archived"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={activeTab === k}
              onClick={() => setTab(k)}
              className={`flex items-center gap-2 pb-3 -mb-px border-b-2 text-[14.5px] font-medium ${activeTab === k ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {label}
              {counts[k] > 0 && <span className={`min-w-[22px] h-[20px] px-1.5 rounded-full text-[12px] font-semibold flex items-center justify-center ${activeTab === k ? "bg-btn" : "bg-chip text-muted"}`}>{counts[k]}</span>}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 bg-white border border-line rounded-full px-3.5 py-2 mb-2 w-[260px] focus-within:border-btn-ring">
          <Search size={14} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name or matter" className="flex-1 bg-transparent outline-none text-[13.5px]" />
        </label>
      </div>

      {error && <div className="mb-4 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3 text-[13.5px]">{error}</div>}

      <div className="border border-line rounded-2xl bg-white overflow-hidden">
        {checks === null ? (
          <div className="flex items-center gap-2 text-[14px] text-muted px-5 py-8">
            <Loader2 size={15} className="animate-spin" /> Loading…
          </div>
        ) : shown.length === 0 ? (
          <div className="text-center px-6 py-14 text-[14px] text-muted">
            {q ? "No checks match that filter." : activeTab === "review" ? "Nothing to review. Checks that find a possible conflict show up here." : "No conflict checks here yet."}
          </div>
        ) : (
          shown.map((c) => (
            <CheckRow key={c.id} c={c} open={openId === c.id} onToggle={() => setOpenId((o) => (o === c.id ? null : c.id))} onChange={update} person={person} clientName={c.clientId ? clients.find((x) => x.id === c.clientId)?.name ?? "client" : null} />
          ))
        )}
      </div>

      {running && (
        <RunConflictModal
          onClose={() => setRunning(false)}
          onDone={(c) => {
            setChecks((list) => [c, ...(list ?? [])]);
            setRunning(false);
            setTab(tabOf(c));
            setOpenId(c.id);
          }}
        />
      )}
    </div>
  );
}

export default function ConflictChecksPage() {
  return (
    <Suspense fallback={null}>
      <ConflictChecksInner />
    </Suspense>
  );
}
