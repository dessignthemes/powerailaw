"use client";

import { Mail } from "lucide-react";
import { useIntegrationsModal } from "@/context/IntegrationsModalContext";

export default function InboxPage() {
  const { openIntegrations } = useIntegrationsModal();

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mb-6">
        <Mail size={26} strokeWidth={1.75} className="text-red-500" />
      </div>
      <h1 className="text-[26px] font-bold mb-3">Connect your mailbox</h1>
      <p className="text-[15px] text-muted max-w-[440px] mb-7 leading-relaxed">
        Connect your Gmail or Outlook account to import emails and link them to
        clients and matters.
      </p>
      <button
        onClick={openIntegrations}
        className="bg-dark text-white px-5 py-2.5 rounded-full text-[14.5px] font-medium hover:bg-dark2 transition-colors"
      >
        Go to Integrations
      </button>
    </div>
  );
}
