"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { GenericDropdown } from "@/components/NewTaskModal";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";

// Under "Assigned to" at the top of a matter: Person acting, Person assisting
// and Originating attorney, by name, each changeable from the firm's people.
type Info = { originatingAttorney: string | null; responsibleStaff: string | null; personActing?: string | null };
type Key = "personActing" | "responsibleStaff" | "originatingAttorney";
const ROWS: [Key, string][] = [
  ["personActing", "Person acting"],
  ["responsibleStaff", "Person assisting"],
  ["originatingAttorney", "Originating attorney"],
];

export default function MatterStaffRows({ matterId }: { matterId: string }) {
  const { teamMembers } = useWorkspaceData();
  const [info, setInfo] = useState<Info | null>(null);
  const [open, setOpen] = useState<Key | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/matters/${matterId}/info`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d?.info && setInfo(d.info as Info))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [matterId]);
  if (!info) return null;
  const nameOf = (id: string | null | undefined) => (id ? teamMembers.find((m) => m.id === id)?.fullName || teamMembers.find((m) => m.id === id)?.email || "—" : "—");
  async function pick(key: Key, id: string | null) {
    setOpen(null);
    const before = info;
    setInfo((i) => (i ? { ...i, [key]: id } : i));
    const r = await fetch(`/api/matters/${matterId}/info`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: id }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) {
      setInfo(before);
      setError(d?.error ?? "That wasn't saved. Please try again.");
    } else setError(null);
  }
  return (
    <>
      {ROWS.map(([key, label]) => (
        <div key={key} className="flex items-center gap-3">
          <span className="w-[130px] text-[13.5px] text-muted flex-shrink-0">{label}</span>
          <GenericDropdown open={open === key} setOpen={(v) => setOpen(v ? key : null)} trigger={<>{nameOf(info[key])}</>}>
            <div className="min-w-[220px] max-h-[300px] overflow-y-auto">
              <button onClick={() => void pick(key, null)} className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13.5px] hover:bg-chip text-muted">
                Nobody {!info[key] && <Check size={14} />}
              </button>
              {teamMembers.map((m) => (
                <button key={m.id} onClick={() => void pick(key, m.id)} className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium hover:bg-chip text-left">
                  <span className="truncate">{m.fullName || m.email}</span>
                  {info[key] === m.id && <Check size={14} />}
                </button>
              ))}
            </div>
          </GenericDropdown>
        </div>
      ))}
      {error && <div className="text-[12.5px] text-[#B42318]">{error}</div>}
    </>
  );
}
