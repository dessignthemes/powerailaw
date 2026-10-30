"use client";

import { useState } from "react";
import { Folder, Search, Check, X } from "lucide-react";
import { GenericDropdown } from "@/components/NewTaskModal";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";

// The "Matter" chip on a task: pick the matter it belongs to (search by number,
// name or client). A task on a matter shows on that matter's Tasks tab.
export default function MatterChip({ value, onChange, locked = false }: { value: string | null | undefined; onChange: (matterId: string | null) => void; locked?: boolean }) {
  const { matters, clients } = useWorkspaceData();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const picked = value ? matters.find((m) => m.id === value) ?? null : null;
  const label = picked ? picked.matterNumber ?? picked.title : "Matter";
  if (locked)
    return (
      <span title={picked?.title} className="flex items-center gap-1.5 bg-[#E1E7F4] px-3 py-1.5 rounded-full text-[13px] font-semibold">
        <Folder size={13} strokeWidth={1.75} /> {label}
      </span>
    );
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const clientName = (id: string | null) => (id ? clients.find((c) => c.id === id)?.name ?? "" : "");
  const list = matters
    .filter((m) => (words.length ? words.every((w) => `${m.matterNumber ?? ""} ${m.title} ${clientName(m.clientId)}`.toLowerCase().includes(w)) : m.status !== "Closed"))
    .sort((a, b) => Number(a.status === "Closed") - Number(b.status === "Closed") || (b.matterNumber ?? "").localeCompare(a.matterNumber ?? ""))
    .slice(0, 50);
  return (
    <GenericDropdown
      open={open}
      setOpen={(v) => {
        setOpen(v);
        if (!v) setQ("");
      }}
      trigger={
        <span className={`flex items-center gap-1.5 ${picked ? "font-semibold" : ""}`} title={picked?.title}>
          <Folder size={13} strokeWidth={1.75} /> {label}
        </span>
      }
    >
      <div className="w-[320px]">
        <div className="relative mb-1.5">
          <Search size={13} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Matter number, name or client"
            aria-label="Search matters"
            className="w-full bg-card-alt rounded-lg pl-8 pr-3 py-2 text-[13.5px] outline-none placeholder:text-muted"
          />
        </div>
        {picked && (
          <button
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[13.5px] text-muted hover:bg-chip"
          >
            <X size={13} /> No matter
          </button>
        )}
        <div className="max-h-[260px] overflow-y-auto flex flex-col gap-[2px]">
          {list.length === 0 && <div className="px-3 py-2 text-[13px] text-muted">{words.length ? "No matters match." : "No open matters."}</div>}
          {list.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onChange(m.id);
                setOpen(false);
                setQ("");
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-[13.5px] ${m.id === value ? "bg-chip" : "hover:bg-chip"}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {m.matterNumber && <b className="mr-1.5">{m.matterNumber}</b>}
                  <span className="text-muted">{m.title}</span>
                </span>
                {clientName(m.clientId) && <span className="block text-[12px] text-muted truncate">{clientName(m.clientId)}</span>}
              </span>
              {m.status === "Closed" && <span className="text-[11px] text-muted">closed</span>}
              {m.id === value && <Check size={14} />}
            </button>
          ))}
        </div>
      </div>
    </GenericDropdown>
  );
}
