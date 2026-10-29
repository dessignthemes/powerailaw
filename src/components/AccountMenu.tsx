"use client";

import ClickAway from "@/components/ClickAway";
import { useEffect, useState } from "react";
import { Settings, Shield, Headphones, LogOut, ChevronsUpDown, Users, Sunrise } from "lucide-react";
import { useIntegrationsModal } from "@/context/IntegrationsModalContext";
import LogoMark from "@/components/LogoMark";

// The signed-in person's initial: first letter of their name, or of their
// email address if the provider didn't share a name.
function userInitial(name: string | null | undefined, email: string) {
  const source = (name || email || "").trim();
  const ch = source.match(/[\p{L}\p{N}]/u)?.[0];
  return ch ? ch.toUpperCase() : "?";
}

export default function AccountMenu({
  email,
  userName,
  orgName,
  onOpenAdmin,
  onOpenTeam,
  onOpenSupport,
  onLogout,
  compact = false,
}: {
  compact?: boolean; // collapsed sidebar: just the initial
  email: string;
  userName?: string | null;
  orgName: string;
  onOpenAdmin: () => void;
  onOpenTeam: () => void;
  onOpenSupport: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  // The 9 AM check-in email, on or off for this person.
  const [digest, setDigest] = useState<boolean | null>(null);
  useEffect(() => {
    if (!open || digest !== null) return;
    let live = true;
    fetch("/api/me/digest")
      .then((r) => (r.ok ? r.json() : { enabled: true }))
      .then((d) => live && setDigest(d.enabled !== false))
      .catch(() => live && setDigest(true));
    return () => {
      live = false;
    };
  }, [open, digest]);
  const toggleDigest = () => {
    const next = !(digest ?? true);
    setDigest(next);
    fetch("/api/me/digest", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }) }).catch(() => {});
  };
  const { openIntegrations } = useIntegrationsModal();

  return (
    <div className="relative">
      {open && (
        <>
          <ClickAway onClose={() => setOpen(false)} />
          <div className="absolute bottom-[calc(100%+8px)] left-0 z-50 w-[280px] bg-cream border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.35)] overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-line">
              <LogoMark size={28} />
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
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[14px] font-medium hover:bg-chip transition-colors text-left"
              >
                <Settings size={16} strokeWidth={1.75} />
                Settings
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  onOpenTeam();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[14px] font-medium hover:bg-chip transition-colors text-left"
              >
                <Users size={16} strokeWidth={1.75} />
                Members
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  onOpenAdmin();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[14px] font-medium hover:bg-chip transition-colors text-left"
              >
                <Shield size={16} strokeWidth={1.75} />
                Admin
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  onOpenSupport();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[14px] font-medium hover:bg-chip transition-colors text-left"
              >
                <Headphones size={16} strokeWidth={1.75} />
                Support
              </button>
            </div>

            <div className="border-t border-line px-2 py-2">
              <button
                onClick={toggleDigest}
                role="switch"
                aria-checked={digest ?? true}
                title="A short email every morning at 9 with your overdue tasks, what's due today and clients waiting for a reply"
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[14px] font-medium hover:bg-chip transition-colors text-left"
              >
                <Sunrise size={16} strokeWidth={1.75} />
                <span className="flex-1">Morning check-in email</span>
                <span className={`relative w-8 h-[18px] rounded-full transition-colors ${digest ?? true ? "bg-ink" : "bg-btn"}`}>
                  <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-[left] ${digest ?? true ? "left-[16px]" : "left-[2px]"}`} />
                </span>
              </button>
            </div>

            <div className="border-t border-line px-2 py-2">
              <button
                onClick={() => {
                  setOpen(false);
                  onLogout();
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
        title={compact ? email : undefined}
        aria-label={compact ? `Account: ${email}` : undefined}
        className={`w-full flex items-center gap-2 py-[6px] rounded-lg hover:bg-nav transition-colors text-left ${compact ? "justify-center px-0" : "px-3"}`}
      >
        <div className="w-6 h-6 rounded-full bg-card-alt border border-line text-muted flex items-center justify-center text-[11px] font-medium flex-shrink-0">
          {userInitial(userName, email)}
        </div>
        {!compact && <span className="text-[12.5px] text-muted truncate flex-1">{email}</span>}
      </button>
    </div>
  );
}
