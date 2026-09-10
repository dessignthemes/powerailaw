"use client";

import { useState } from "react";
import { CircleUser, CheckCircle2, CircleDashed, User, Building2, Mail, Phone, MapPin } from "lucide-react";
import NewClientModal, { Client, ClientStatus, ClientType } from "@/components/NewClientModal";

const statusMeta: Record<ClientStatus, { icon: typeof CheckCircle2; color: string }> = {
  Active: { icon: CheckCircle2, color: "text-green-600" },
  Archived: { icon: CircleDashed, color: "text-muted" },
};

const typeMeta: Record<ClientType, { icon: typeof User }> = {
  Individual: { icon: User },
  "Legal entity": { icon: Building2 },
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="px-10 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-[28px] font-semibold">
          Clients <span className="text-muted font-normal text-[18px]">/ {clients.length}</span>
        </h1>
        <button
          onClick={() => setModalOpen(true)}
          className="bg-dark text-white px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors"
        >
          + Add client
        </button>
      </div>

      {clients.length === 0 ? (
        <div className="border border-line rounded-2xl min-h-[320px] flex flex-col items-center justify-center text-center">
          <CircleUser size={26} strokeWidth={1.5} className="text-muted mb-4" />
          <div className="text-[16px] font-semibold mb-1">No clients yet</div>
          <div className="text-[14px] text-muted mb-5">Add your first client to start tracking matters for them.</div>
          <button
            onClick={() => setModalOpen(true)}
            className="bg-dark text-white px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors"
          >
            + Add client
          </button>
        </div>
      ) : (
        <div className="border border-line rounded-2xl divide-y divide-line overflow-hidden">
          {clients.map((c) => {
            const StatusIcon = statusMeta[c.status].icon;
            const TypeIcon = typeMeta[c.type].icon;
            return (
              <div key={c.id} className="flex items-center justify-between px-5 py-4 hover:bg-card-alt/40 transition-colors">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-line flex items-center justify-center text-[14px] font-medium text-muted flex-shrink-0">
                    {c.name.charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[14.5px] font-semibold truncate">{c.name}</div>
                    {c.description && (
                      <div className="text-[13px] text-muted truncate">{c.description}</div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="flex items-center gap-1.5 bg-card-alt px-3 py-1.5 rounded-full text-[12.5px] font-medium">
                    <TypeIcon size={12} strokeWidth={1.75} />
                    {c.type}
                  </span>
                  {c.email && (
                    <span className="hidden md:flex items-center gap-1.5 text-muted text-[12.5px]">
                      <Mail size={12} strokeWidth={1.75} />
                      {c.email}
                    </span>
                  )}
                  {c.phone && (
                    <span className="hidden lg:flex items-center gap-1.5 text-muted text-[12.5px]">
                      <Phone size={12} strokeWidth={1.75} />
                      {c.phone}
                    </span>
                  )}
                  {c.address && (
                    <span className="hidden xl:flex items-center gap-1.5 text-muted text-[12.5px]">
                      <MapPin size={12} strokeWidth={1.75} />
                      {c.address}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 bg-card-alt px-3 py-1.5 rounded-full text-[12.5px] font-medium">
                    <StatusIcon size={12} strokeWidth={2} className={statusMeta[c.status].color} />
                    {c.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <NewClientModal
          onClose={() => setModalOpen(false)}
          onCreate={(client) => {
            setClients((cs) => [...cs, client]);
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
