"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Search, User, Building2, CircleUser, Plus } from "lucide-react";
import { MATTER_ROLES } from "@/components/matters/contactRoles";

type Option = { kind: "contact" | "client"; id: string; name: string; sub: string; type: string };

// Adds someone to a matter: an existing contact or client, or a new contact.
export default function AddMatterContactModal({
  matterId,
  clients,
  excludeClientId,
  onClose,
  onAdded,
}: {
  matterId: string;
  clients: { id: string; name: string; email?: string | null; type?: string }[];
  excludeClientId?: string | null;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [contacts, setContacts] = useState<{ id: string; kind: string; name: string; email: string | null; company: string; role: string }[] | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Option | null>(null);
  const [creating, setCreating] = useState(false);
  const [nc, setNc] = useState({ name: "", kind: "person", email: "", phone: "", company: "" });
  const [role, setRole] = useState("");
  // A linked client can see this matter in their portal: on for co-clients, off
  // otherwise (they may be on the other side), unless changed here.
  const [portal, setPortal] = useState<boolean | null>(null);
  const portalOn = portal ?? /client/i.test(role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/contacts")
      .then((r) => (r.ok ? r.json() : { contacts: [] }))
      .then((d) => setContacts(d.contacts ?? []))
      .catch(() => setContacts([]));
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const options = useMemo<Option[]>(() => {
    const all: Option[] = [
      ...(contacts ?? []).map((c) => ({ kind: "contact" as const, id: c.id, name: c.name, sub: [c.role, c.company, c.email].filter(Boolean).join(" · "), type: c.kind === "company" ? "Company" : "Person" })),
      ...clients.filter((c) => c.id !== excludeClientId).map((c) => ({ kind: "client" as const, id: c.id, name: c.name, sub: c.email ?? "", type: "Client" })),
    ];
    const t = q.trim().toLowerCase();
    return (t ? all.filter((o) => `${o.name} ${o.sub}`.toLowerCase().includes(t)) : all).slice(0, 40);
  }, [contacts, clients, q, excludeClientId]);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const body = creating ? { newContact: nc, role } : picked?.kind === "client" ? { clientId: picked.id, role, portalAccess: portalOn } : { contactId: picked?.id, role };
      const res = await fetch(`/api/matters/${matterId}/contacts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? "Couldn't add them. Please try again.");
      onAdded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = "bg-white border border-line rounded-lg px-3 py-2 text-[13.5px] outline-none focus:border-btn-ring";
  const ready = creating ? !!nc.name.trim() : !!picked;

  return (
    <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center px-4 py-8" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-[560px] max-h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add a contact to this matter">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-[17px] font-semibold">Add a contact to this matter</h2>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 pb-6 text-[13.5px]">
          {creating ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 flex gap-2">
                {(
                  [
                    ["person", "Person"],
                    ["company", "Company"],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} onClick={() => setNc({ ...nc, kind: k })} className={`px-3 py-1.5 rounded-full text-[13px] font-medium ${nc.kind === k ? "bg-btn-hover" : "bg-chip hover:bg-btn"}`}>
                    {l}
                  </button>
                ))}
                <button onClick={() => setCreating(false)} className="ml-auto text-[12.5px] underline underline-offset-2 text-muted hover:text-ink">
                  Pick an existing contact instead
                </button>
              </div>
              <input autoFocus value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} placeholder={nc.kind === "company" ? "Company name" : "Full name"} aria-label="Name" className={`${input} col-span-2`} />
              {nc.kind === "person" && <input value={nc.company} onChange={(e) => setNc({ ...nc, company: e.target.value })} placeholder="Company (optional)" aria-label="Company" className={`${input} col-span-2`} />}
              <input value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} placeholder="Email" aria-label="Email" className={input} />
              <input value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} placeholder="Phone" aria-label="Phone" className={input} />
            </div>
          ) : picked ? (
            <div className="flex items-center gap-2 border border-btn rounded-xl px-3 py-2.5 bg-card-alt/50">
              <span className="font-medium truncate">{picked.name}</span>
              <span className="text-[12px] text-muted">{picked.type}</span>
              <button onClick={() => setPicked(null)} className="ml-auto text-[12.5px] underline underline-offset-2 text-muted hover:text-ink">
                Change
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 bg-chip rounded-full px-3 py-2 mb-2">
                <Search size={14} className="text-muted" />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts and clients" aria-label="Search contacts and clients" className="flex-1 bg-transparent outline-none" />
              </div>
              <div className="border border-line rounded-xl max-h-[280px] overflow-y-auto">
                {contacts === null ? (
                  <div className="px-3 py-3 text-muted flex items-center gap-2">
                    <Loader2 size={13} className="animate-spin" /> Loading contacts…
                  </div>
                ) : options.length === 0 ? (
                  <div className="px-3 py-3 text-muted">No one matches. Add them as a new contact below.</div>
                ) : (
                  options.map((o) => (
                    <button key={`${o.kind}-${o.id}`} onClick={() => setPicked(o)} className="w-full text-left flex items-center gap-2.5 px-3 py-2 hover:bg-chip border-b border-line last:border-0">
                      {o.kind === "client" ? <CircleUser size={14} className="text-muted flex-shrink-0" /> : o.type === "Company" ? <Building2 size={14} className="text-muted flex-shrink-0" /> : <User size={14} className="text-muted flex-shrink-0" />}
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium truncate">{o.name}</span>
                        {o.sub && <span className="block text-[12px] text-muted truncate">{o.sub}</span>}
                      </span>
                      <span className="text-[11.5px] text-muted flex-shrink-0">{o.type}</span>
                    </button>
                  ))
                )}
              </div>
              <button
                onClick={() => {
                  setCreating(true);
                  setNc((n) => ({ ...n, name: q.trim() }));
                }}
                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-chip hover:bg-btn text-[13px] font-medium"
              >
                <Plus size={13} /> New contact{q.trim() ? `: “${q.trim()}”` : ""}
              </button>
            </>
          )}

          {ready && (
            <label className="flex flex-col gap-1 mt-4">
              <span className="text-[12.5px] text-muted">Role on this matter</span>
              <input value={role} onChange={(e) => setRole(e.target.value)} list="matter-roles" placeholder="e.g. Seller's attorney, Realtor, Lender" className={input} />
              <datalist id="matter-roles">
                {MATTER_ROLES.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </label>
          )}
          {ready && !creating && picked?.kind === "client" && (
            <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
              <input type="checkbox" checked={portalOn} onChange={(e) => setPortal(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#5E6E8C]" />
              <span>
                <span className="font-medium">Can see this matter in their client portal</span>
                <span className="block text-[12.5px] text-muted">Only for someone on your client&apos;s side (e.g. a co-client): they&apos;ll see its status, shared documents and messages.</span>
              </span>
            </label>
          )}
          {error && <div className="mt-3 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3">{error}</div>}
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={onClose} disabled={busy} className="px-4 py-2 rounded-full hover:bg-chip font-medium">
              Cancel
            </button>
            <button onClick={() => void add()} disabled={busy || !ready} className="bg-btn hover:bg-btn-hover disabled:opacity-50 px-4 py-2 rounded-full font-medium flex items-center gap-2">
              {busy && <Loader2 size={14} className="animate-spin" />} Add to matter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
