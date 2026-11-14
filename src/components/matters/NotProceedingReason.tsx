"use client";

import { useEffect, useState } from "react";
import { X, XCircle } from "lucide-react";
import type { Matter } from "@/components/NewMatterModal";

// Asked when a matter is set to Not proceeding: why didn't the client go ahead?
// Optional; it shows in Reports so the firm can look back on it.
const COMMON = ["Price / fees", "Went with another attorney", "Deal fell through", "Financing not approved", "Inspection issues", "Client changed their mind", "No response from client"];

export default function NotProceedingReason({ matter, onSave, onCancel }: { matter: Matter; onSave: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="w-full max-w-[520px] bg-white rounded-3xl p-6">
        <div className="flex items-start gap-3 mb-3">
          <XCircle size={20} className="text-[#B42318] mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 className="text-[18px] font-semibold">Not proceeding</h2>
            <p className="text-[13px] text-muted truncate">{matter.matterNumber ? `${matter.matterNumber} · ` : ""}{matter.title}</p>
          </div>
          <button onClick={onCancel} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <label className="text-[13px] font-medium">Why didn&apos;t the client proceed? <span className="text-muted font-normal">(optional)</span></label>
        <div className="flex flex-wrap gap-1.5 mt-2 mb-2">
          {COMMON.map((c) => (
            <button key={c} onClick={() => setReason(c)} className={`px-2.5 py-1 rounded-full text-[12.5px] border ${reason === c ? "bg-[#E7E5E1] border-[#C4C0B8]" : "bg-white border-[#E6E4E0] hover:bg-[#F3F2F0]"}`}>
              {c}
            </button>
          ))}
        </div>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="A few words, e.g. went with a cheaper firm"
          className="w-full bg-white border border-line rounded-xl px-3 py-2 text-[14px] outline-none resize-y"
        />
        <p className="text-[12px] text-muted mt-1">It shows in Reports so you can look back on why matters didn&apos;t go ahead.</p>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => onSave("")} className="px-4 py-2 rounded-full text-[13.5px] font-medium bg-chip hover:bg-btn">
            Skip
          </button>
          <button onClick={() => onSave(reason)} className="px-4 py-2 rounded-full text-[13.5px] font-medium bg-btn hover:bg-btn-hover">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
