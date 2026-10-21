"use client";

import { useEffect, useState } from "react";
import { Globe, X } from "lucide-react";
import PortalView from "@/components/clientCard/PortalView";

type Access = { status: "invited" | "active" | "disabled" } | null;

// "Client portal" button with the client's status (Active / Invited / Off).
// Opens the portal settings (invite, resend, share documents) in a window,
// or runs onOpen instead (the client card jumps to its own Client portal section).
export default function PortalButton({
  clientId,
  defaultEmail,
  defaultName,
  onOpen,
  size = "chip",
}: {
  clientId: string | null;
  defaultEmail?: string;
  defaultName?: string;
  onOpen?: () => void;
  size?: "chip" | "button";
}) {
  const [access, setAccess] = useState<Access | undefined>(undefined);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    let live = true;
    fetch(`/api/client-portal/${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { access?: Access } | null) => live && setAccess(d?.access ?? null))
      .catch(() => live && setAccess(null));
    return () => {
      live = false;
    };
  }, [clientId, open]);

  const status = !clientId ? null : access === undefined ? "…" : access?.status === "active" ? "Active" : access?.status === "invited" ? "Invited" : "Off";
  const dot = status === "Active" ? "bg-[#00C271]" : status === "Invited" ? "bg-[#FFB341]" : "bg-[#AEB8C6]";
  const cls =
    size === "chip"
      ? "flex items-center gap-1.5 bg-chip hover:bg-btn px-3 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap flex-shrink-0"
      : "bg-chip hover:bg-btn px-3.5 py-2 rounded-full text-[13px] font-medium flex items-center gap-1.5 whitespace-nowrap flex-shrink-0";

  return (
    <>
      <button
        type="button"
        disabled={!clientId}
        onClick={() => (onOpen ? onOpen() : setOpen(true))}
        title={clientId ? "Invite this client to the client portal, or manage their access" : "Pick or save the client first"}
        className={`${cls} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <Globe size={13} strokeWidth={1.75} />
        Client portal
        {status && (
          <span className="flex items-center gap-1 text-muted font-normal">
            · <span className={`w-1.5 h-1.5 rounded-full ${dot}`} /> {status}
          </span>
        )}
      </button>
      {open && clientId && (
        <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center px-4 py-8" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-[760px] max-h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Client portal">
            <div className="flex items-center justify-between px-6 pt-5">
              <h2 className="text-[17px] font-semibold">Client portal{defaultName ? ` · ${defaultName}` : ""}</h2>
              <button onClick={() => setOpen(false)} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center">
                <X size={16} />
              </button>
            </div>
            <div className="px-6 pb-6">
              <PortalView clientId={clientId} defaultEmail={defaultEmail} defaultName={defaultName} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
