"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { X, Loader2, Link2 } from "lucide-react";
import { MATTER_ROLES } from "@/components/matters/contactRoles";

type M = { id: string; title: string; matterNumber?: string | null; status: string; clientId?: string | null };
type Linked = { linkId: string; role: string; matterId: string; title: string; number: string | null; status: string };

// Links a contact or client to a matter: as a contact with a role, or (clients
// only) as the matter's own client.
export function LinkToMatterModal({
  who,
  matters,
  onClose,
  onLinked,
  onMakeClient,
}: {
  who: { kind: "contact" | "client"; id: string; name: string };
  matters: M[];
  onClose: () => void;
  onLinked: () => void;
  onMakeClient?: (matterId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [matterId, setMatterId] = useState("");
  const [asClient, setAsClient] = useState(false);
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matter = matters.find((m) => m.id === matterId) ?? null;
  const options = matters
    .filter((m) => m.status !== "Closed")
    .filter((m) => !q.trim() || `${m.matterNumber ?? ""} ${m.title}`.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 40);

  async function save() {
    if (!matter) return;
    setBusy(true);
    setError(null);
    try {
      if (asClient && onMakeClient) {
        onMakeClient(matter.id);
      } else {
        const res = await fetch(`/api/matters/${matter.id}/contacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(who.kind === "client" ? { clientId: who.id, role } : { contactId: who.id, role }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d?.error ?? "Couldn't link them. Please try again.");
      }
      onLinked();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = "bg-white border border-line rounded-lg px-3 py-2 text-[13.5px] outline-none focus:border-btn-ring";
  return (
    <div className="fixed inset-0 z-[70] bg-black/30 flex items-center justify-center px-4 py-8" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-[540px] max-h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Link to a matter">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-[17px] font-semibold">Link {who.name} to a matter</h2>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 pb-6 text-[13.5px]">
          {matter ? (
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-[#E1E7F4] rounded-md px-2 py-1 font-semibold text-[12.5px]">{matter.matterNumber ?? "Matter"}</span>
              <span className="truncate text-muted">{matter.title}</span>
              <button onClick={() => setMatterId("")} className="ml-auto text-[12.5px] underline underline-offset-2 text-muted hover:text-ink flex-shrink-0">
                Change
              </button>
            </div>
          ) : (
            <div className="mb-2">
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Matter number or name" aria-label="Find a matter" className={`${input} w-full mb-2`} />
              <div className="border border-line rounded-xl max-h-[260px] overflow-y-auto">
                {options.length === 0 ? (
                  <div className="px-3 py-3 text-muted">No matching open matters.</div>
                ) : (
                  options.map((m) => (
                    <button key={m.id} onClick={() => setMatterId(m.id)} className="w-full text-left flex gap-2 px-3 py-2 hover:bg-chip border-b border-line last:border-0">
                      {m.matterNumber && <span className="font-semibold flex-shrink-0">{m.matterNumber}</span>}
                      <span className="truncate text-muted">{m.title}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
          {matter && (
            <>
              {who.kind === "client" && onMakeClient && (
                <div className="flex flex-col gap-2 mb-3">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input type="radio" checked={!asClient} onChange={() => setAsClient(false)} className="mt-1 accent-[#5E6E8C]" />
                    <span>
                      <b>Add as a contact on the matter</b>
                      <span className="block text-muted text-[12.5px]">e.g. co-client, seller, beneficiary. The matter keeps its own client.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input type="radio" checked={asClient} onChange={() => setAsClient(true)} className="mt-1 accent-[#5E6E8C]" />
                    <span>
                      <b>Make them the matter&apos;s client</b>
                      <span className="block text-muted text-[12.5px]">{matter.clientId && matter.clientId !== who.id ? "This replaces the matter's current client." : "The matter has no client yet."}</span>
                    </span>
                  </label>
                </div>
              )}
              {!asClient && (
                <label className="flex flex-col gap-1">
                  <span className="text-[12.5px] text-muted">Role on this matter</span>
                  <input value={role} onChange={(e) => setRole(e.target.value)} list="link-matter-roles" placeholder="e.g. Seller, Realtor, Lender" className={input} />
                  <datalist id="link-matter-roles">
                    {MATTER_ROLES.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </label>
              )}
            </>
          )}
          {error && <div className="mt-3 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3">{error}</div>}
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={onClose} disabled={busy} className="px-4 py-2 rounded-full hover:bg-chip font-medium">
              Cancel
            </button>
            <button onClick={() => void save()} disabled={busy || !matter} className="bg-btn hover:bg-btn-hover disabled:opacity-50 px-4 py-2 rounded-full font-medium flex items-center gap-2">
              {busy && <Loader2 size={14} className="animate-spin" />} Link to matter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// "Matters" list for a contact or client: the matters they're on as a contact
// (with role), each removable, and Link to a matter.
export default function MatterLinks({
  who,
  matters,
  onMakeClient,
  title = "On these matters",
  hideButton = false,
}: {
  who: { kind: "contact" | "client"; id: string; name: string };
  matters: M[];
  onMakeClient?: (matterId: string) => void;
  title?: string;
  hideButton?: boolean; // the page already has its own Link to a matter button
}) {
  const [list, setList] = useState<Linked[] | null>(null);
  const [linking, setLinking] = useState(false);
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((r) => r + 1), []);
  useEffect(() => {
    let live = true;
    fetch(`/api/contacts/matters?${who.kind === "client" ? "clientId" : "contactId"}=${who.id}`)
      .then((r) => (r.ok ? r.json() : { matters: [] }))
      .then((d) => live && setList(d.matters ?? []))
      .catch(() => live && setList([]));
    return () => {
      live = false;
    };
  }, [who.id, who.kind, reload]);

  async function remove(l: Linked) {
    if (!confirm(`Take ${who.name} off ${l.number ?? l.title}?`)) return;
    await fetch(`/api/matters/${l.matterId}/contacts?linkId=${l.linkId}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="text-[13px] font-semibold">{title}</div>
        {!hideButton && (
          <button onClick={() => setLinking(true)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-chip hover:bg-btn text-[12.5px] font-medium">
            <Link2 size={13} /> Link to a matter
          </button>
        )}
      </div>
      {list === null ? (
        <div className="text-[13px] text-muted flex items-center gap-2">
          <Loader2 size={13} className="animate-spin" /> Loading…
        </div>
      ) : list.length === 0 ? (
        <div className="text-[13px] text-muted">Not linked to any matter{who.kind === "client" ? " as a contact" : ""} yet.</div>
      ) : (
        <div className="border border-line rounded-xl overflow-hidden">
          {list.map((l) => (
            <div key={l.linkId} className="group flex items-center gap-2 px-3 py-2 border-b border-line last:border-0 text-[13.5px]">
              <Link href={`/dashboard/matters/${l.matterId}`} className="font-medium hover:underline underline-offset-2 flex-shrink-0">
                {l.number ?? "Matter"}
              </Link>
              <span className="truncate text-muted">{l.title}</span>
              {l.role && <span className="text-[11.5px] bg-[#E1E7F4] rounded-md px-1.5 py-px flex-shrink-0">{l.role}</span>}
              <span className="ml-auto text-[12px] text-muted flex-shrink-0">{l.status}</span>
              <button onClick={() => void remove(l)} aria-label={`Take off ${l.number ?? l.title}`} className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-6 h-6 rounded-full hover:bg-chip flex items-center justify-center text-muted flex-shrink-0">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      {linking && (
        <LinkToMatterModal
          who={who}
          matters={matters}
          onClose={() => setLinking(false)}
          onMakeClient={onMakeClient}
          onLinked={() => {
            setLinking(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

