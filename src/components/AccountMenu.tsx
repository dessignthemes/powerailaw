"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, Shield, Headphones, Box, LogOut, ChevronsUpDown } from "lucide-react";
import { useIntegrationsModal } from "@/context/IntegrationsModalContext";

export default function AccountMenu({
  email,
  orgName,
  onOpenAdmin,
  onOpenSupport,
}: {
  email: string;
  orgName: string;
  onOpenAdmin: () => void;
  onOpenSupport: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { openIntegrations } = useIntegrationsModal();
  const router = useRouter();

  return (
    <div className="relative">
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-[calc(100%+8px)] left-0 z-50 w-[280px] bg-cream border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.35)] overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-line">
              <div className="w-7 h-7 rounded-full bg-card-alt flex items-center justify-center text-[13px] font-semibold flex-shrink-0">
                {orgName.charAt(0).toUpperCase()}
              </div>
              <span className="text-[14.5px] font-semibold flex-1 truncate">{orgName}</span>
              <ChevronsUpDown size={14} strokeWidth={1.75} className="text-muted flex-shrink-0" />
            </div>

            <div className="px-2 pt-3 pb-2">
              <div className="px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">
                General
              </div>
              <button
                onClick={() => {
                  setOpen(false);
                  openIntegrations("general");
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[14px] font-medium hover:bg-card-alt transition-colors text-left"
              >
                <Settings size={16} strokeWidth={1.75} />
                Settings
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  onOpenAdmin();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[14px] font-medium hover:bg-card-alt transition-colors text-left"
              >
                <Shield size={16} strokeWidth={1.75} />
                Admin
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  onOpenSupport();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[14px] font-medium hover:bg-card-alt transition-colors text-left"
              >
                <Headphones size={16} strokeWidth={1.75} />
                Support
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  openIntegrations("integrations");
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[14px] font-medium hover:bg-card-alt transition-colors text-left"
              >
                <Box size={16} strokeWidth={1.75} />
                Integrations
              </button>
            </div>

            <div className="border-t border-line px-2 py-2">
              <button
                onClick={() => {
                  setOpen(false);
                  router.push("/");
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[14px] font-medium text-red-500 hover:bg-red-50 transition-colors text-left"
              >
                <LogOut size={16} strokeWidth={1.75} />
                Log out
              </button>
            </div>
          </div>
        </>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-card-alt transition-colors text-left"
      >
        <div className="w-6 h-6 rounded-full bg-dark text-white flex items-center justify-center text-[11px] font-medium flex-shrink-0">
          {orgName.charAt(0).toUpperCase()}
        </div>
        <span className="text-[13px] text-muted truncate flex-1">{email}</span>
      </button>
    </div>
  );
}
