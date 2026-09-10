"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Client, ClientStatus } from "@/components/NewClientModal";
import type { Matter, MatterStatus } from "@/components/NewMatterModal";

type WorkspaceDataContextValue = {
  clients: Client[];
  addClient: (client: Client) => void;
  updateClient: (client: Client) => void;
  deleteClients: (ids: string[]) => void;
  bulkSetClientStatus: (ids: string[], status: ClientStatus) => void;

  matters: Matter[];
  addMatter: (matter: Matter) => void;
  updateMatter: (matter: Matter) => void;
  deleteMatters: (ids: string[]) => void;
  bulkSetMatterStatus: (ids: string[], status: MatterStatus) => void;
};

const WorkspaceDataContext = createContext<WorkspaceDataContextValue | null>(null);

export function WorkspaceDataProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);

  function addClient(client: Client) {
    setClients((cs) => [...cs, client]);
  }
  function updateClient(client: Client) {
    setClients((cs) => cs.map((c) => (c.id === client.id ? client : c)));
  }
  function deleteClients(ids: string[]) {
    setClients((cs) => cs.filter((c) => !ids.includes(c.id)));
  }
  function bulkSetClientStatus(ids: string[], status: ClientStatus) {
    setClients((cs) =>
      cs.map((c) => (ids.includes(c.id) ? { ...c, status, updatedAt: new Date().toISOString() } : c))
    );
  }

  function addMatter(matter: Matter) {
    setMatters((ms) => [...ms, matter]);
  }
  function updateMatter(matter: Matter) {
    setMatters((ms) => ms.map((m) => (m.id === matter.id ? matter : m)));
  }
  function deleteMatters(ids: string[]) {
    setMatters((ms) => ms.filter((m) => !ids.includes(m.id)));
  }
  function bulkSetMatterStatus(ids: string[], status: MatterStatus) {
    setMatters((ms) =>
      ms.map((m) => (ids.includes(m.id) ? { ...m, status, updatedAt: new Date().toISOString() } : m))
    );
  }

  return (
    <WorkspaceDataContext.Provider
      value={{
        clients,
        addClient,
        updateClient,
        deleteClients,
        bulkSetClientStatus,
        matters,
        addMatter,
        updateMatter,
        deleteMatters,
        bulkSetMatterStatus,
      }}
    >
      {children}
    </WorkspaceDataContext.Provider>
  );
}

export function useWorkspaceData() {
  const ctx = useContext(WorkspaceDataContext);
  if (!ctx) {
    throw new Error("useWorkspaceData must be used within WorkspaceDataProvider");
  }
  return ctx;
}
