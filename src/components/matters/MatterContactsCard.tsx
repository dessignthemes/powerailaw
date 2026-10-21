"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, Plus, X, Mail, Phone } from "lucide-react";
import AddMatterContactModal from "@/components/matters/AddMatterContactModal";

type MC = { id: string; role: string; portalAccess?: boolean; kind: "contact" | "client"; targetId: string; name: string; type: string; email: string | null; phone: string | null; company: string };

// The matter's Contacts card: everyone on the matter with their role.
export default function MatterContactsCard({ matterId, clientId, clients }: { matterId: string; clientId: string | null; clients: { id: string; name: string; email?: string | null }[] }) {
  const [list, setList] = useState<MC[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((r) => r + 1), []);

  useEffect(() => {
    let live = true;
    fetch(`/api/matters/${matterId}/contacts`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error ?? "Couldn't load the contacts.");
        return d.contacts as MC[];
      })
      .then((c) => live && (setList(c), setError(null)))
      .catch((e: Error) => live && (setError(e.message), setList([])));
    return () => {
      live = false;
    };
  }, [matterId, reload]);

  async function togglePortal(c: MC) {
    const on = !c.portalAccess;
    if (on && !confirm(`Let ${c.name} see this matter in their client portal (status, shared documents and messages)? Only do this for someone on your client's side.`)) return;
    const res = await fetch(`/api/matters/${matterId}/contacts`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ linkId: c.id, portalAccess: on }) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d?.error ?? "Couldn't change portal access.");
    }
    refresh();
  }

  async function remove(c: MC) {
    if (!confirm(`Take ${c.name} off this matter? They stay in Contacts.`)) return;
    await fetch(`/api/matters/${matterId}/contacts?linkId=${c.id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-line">
      <div className="flex items-center gap-2 bg-card-alt px-4 py-3">
        <Bookmark size={14} strokeWidth={1.75} className="text-muted" />
        <span className="text-[14px] font-semibold">Contacts</span>
        <button onClick={() => setAdding(true)} className="ml-auto flex items-center gap-1 text-[13px] text-muted hover:text-ink">
          <Plus size={13} /> Add
        </button>
      </div>
      {error ? (
        <div className="p-4 text-[13px] text-[#8A4B14]">{error}</div>
      ) : list && list.length === 0 ? (
        <div className="p-6 flex flex-col items-center justify-center text-center gap-2">
          <Bookmark size={20} strokeWidth={1.5} className="text-muted" />
          <div className="text-[13px] text-muted">No contacts yet.</div>
          <button onClick={() => setAdding(true)} className="mt-1 flex items-center gap-1 px-3 py-1.5 rounded-full bg-chip hover:bg-btn text-[13px] font-medium">
            <Plus size={13} /> Add a contact
          </button>
        </div>
      ) : (
        <div className="p-2 flex flex-col">
          {(list ?? []).map((c) => (
            <div key={c.id} className="group flex items-start gap-2 px-2.5 py-2 rounded-xl hover:bg-card-alt">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <Link
                    href={c.kind === "client" ? `/dashboard/client-intake?card=${c.targetId}` : `/dashboard/records?contact=${c.targetId}`}
                    className="text-[13.5px] font-medium truncate hover:underline underline-offset-2"
                  >
                    {c.name}
                  </Link>
                  {c.role && <span className="text-[11.5px] bg-[#E1E7F4] rounded-md px-1.5 py-px flex-shrink-0">{c.role}</span>}
                  {c.kind === "client" && (
                    <button
                      onClick={() => void togglePortal(c)}
                      title={c.portalAccess ? "Sees this matter in their client portal. Click to turn off." : "Doesn't see this matter in their client portal. Click to turn on."}
                      className={`text-[11px] rounded-md px-1.5 py-px flex-shrink-0 ${c.portalAccess ? "bg-[#CAF0D9] text-[#14532D]" : "bg-card-alt text-muted"}`}
                    >
                      Portal {c.portalAccess ? "on" : "off"}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[12px] text-muted mt-0.5 min-w-0">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="flex items-center gap-1 truncate hover:text-ink">
                      <Mail size={11} /> {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="flex items-center gap-1 flex-shrink-0 hover:text-ink">
                      <Phone size={11} /> {c.phone}
                    </a>
                  )}
                  {!c.email && !c.phone && c.company && <span className="truncate">{c.company}</span>}
                </div>
              </div>
              <button onClick={() => void remove(c)} aria-label={`Remove ${c.name} from this matter`} title="Take off this matter" className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-6 h-6 rounded-full hover:bg-chip flex items-center justify-center text-muted">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      {adding && (
        <AddMatterContactModal
          matterId={matterId}
          clients={clients}
          excludeClientId={clientId}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
