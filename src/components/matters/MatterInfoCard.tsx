"use client";

import { useEffect, useState } from "react";
import { Info, Loader2, Check } from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import type { MatterInfo } from "@/lib/data/matterInfo";

// Matter info on the Details tab: the extra details from the New matter window
// (originating attorney, staff, reference, location, dates, statute of
// limitations, trust minimum). Each change saves when you leave the field.
export default function MatterInfoCard({ matterId }: { matterId: string }) {
  const { teamMembers } = useWorkspaceData();
  const [info, setInfo] = useState<MatterInfo | null>(null);
  const [ready, setReady] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/matters/${matterId}/info`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { info: MatterInfo | null; ready: boolean } | null) => {
        if (!live || !d) return;
        setReady(d.ready);
        setInfo(d.info);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [matterId]);

  async function save(patch: Partial<MatterInfo>) {
    setInfo((x) => (x ? { ...x, ...patch } : x));
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/matters/${matterId}/info`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? "Couldn't save.");
      setInfo(d.info);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!ready || !info) return null;
  const input = "w-full bg-white border border-line rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus:border-btn-ring";
  const label = "text-[12px] text-muted mb-0.5 block";
  const person = (key: "originatingAttorney" | "responsibleStaff", name: string) => (
    <label>
      <span className={label}>{name}</span>
      <select value={info[key] ?? ""} onChange={(e) => void save({ [key]: e.target.value || null })} className={input}>
        <option value="">—</option>
        {teamMembers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.fullName || m.email}
          </option>
        ))}
      </select>
    </label>
  );
  const text = (key: "clientReference" | "location", name: string) => (
    <label>
      <span className={label}>{name}</span>
      <input defaultValue={info[key]} onBlur={(e) => e.target.value.trim() !== info[key] && void save({ [key]: e.target.value })} className={input} />
    </label>
  );
  const date = (key: "openDate" | "pendingDate" | "closedDate" | "solDate", name: string) => (
    <label>
      <span className={label}>{name}</span>
      <input type="date" value={info[key] ?? ""} onChange={(e) => void save({ [key]: e.target.value || null })} className={input} />
    </label>
  );
  return (
    <div className="rounded-2xl border border-line overflow-hidden mb-4">
      <div className="flex items-center gap-2 bg-card-alt px-4 py-3">
        <Info size={14} strokeWidth={1.75} className="text-muted" />
        <span className="text-[14px] font-semibold">Matter info</span>
        <span className="ml-auto text-[12px] text-muted flex items-center gap-1">
          {saving ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Saving
            </>
          ) : saved ? (
            <>
              <Check size={12} /> Saved
            </>
          ) : null}
        </span>
      </div>
      {error && <div className="mx-4 mt-3 rounded-lg bg-[#FDECEC] text-[#9F1D1D] px-3 py-2 text-[12.5px]">{error}</div>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3 p-4">
        {person("originatingAttorney", "Originating attorney")}
        {person("responsibleStaff", "Responsible staff")}
        {text("clientReference", "Client reference number")}
        {text("location", "Location")}
        {date("openDate", "Open date")}
        {date("pendingDate", "Pending date")}
        {date("closedDate", "Closed date")}
        <div>
          {date("solDate", "Statute of limitations")}
          <label className="flex items-center gap-1.5 text-[12px] mt-1 cursor-pointer">
            <input type="checkbox" checked={info.solSatisfied} onChange={(e) => void save({ solSatisfied: e.target.checked })} className="w-3.5 h-3.5 accent-[#5E6E8C]" /> Satisfied
          </label>
        </div>
        <label>
          <span className={label}>Trust minimum ($)</span>
          <input
            defaultValue={info.trustMinimum ?? ""}
            inputMode="decimal"
            onBlur={(e) => {
              const v = e.target.value.replace(/[^\d.]/g, "");
              if ((v === "" ? null : Number(v)) !== info.trustMinimum) void save({ trustMinimum: v === "" ? null : Number(v) });
            }}
            className={input}
          />
        </label>
      </div>
    </div>
  );
}
