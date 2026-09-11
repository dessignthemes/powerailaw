"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { Client, ClientStatus } from "@/components/NewClientModal";
import type { Matter, MatterStatus } from "@/components/NewMatterModal";

type WorkspaceDataContextValue = {
  clients: Client[];
  clientsLoaded: boolean;
  addClient: (client: Client) => void;
  updateClient: (client: Client) => void;
  deleteClients: (ids: string[]) => void;
  bulkSetClientStatus: (ids: string[], status: ClientStatus) => void;

  matters: Matter[];
  mattersLoaded: boolean;
  addMatter: (matter: Matter) => void;
  updateMatter: (matter: Matter) => void;
  deleteMatters: (ids: string[]) => void;
  bulkSetMatterStatus: (ids: string[], status: MatterStatus) => void;
};

const WorkspaceDataContext = createContext<WorkspaceDataContextValue | null>(null);

export function WorkspaceDataProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [mattersLoaded, setMattersLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/clients")
      .then((res) => res.json())
      .then((data) => setClients(data.clients ?? []))
      .catch((err) => console.error("Failed to load clients:", err))
      .finally(() => setClientsLoaded(true));

    fetch("/api/matters")
      .then((res) => res.json())
      .then((data) => setMatters(data.matters ?? []))
      .catch((err) => console.error("Failed to load matters:", err))
      .finally(() => setMattersLoaded(true));
  }, []);

  const addClient = useCallback((client: Client) => {
    setClients((cs) => [...cs, client]); // optimistic
    fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(client),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.client) {
          setClients((cs) => cs.map((c) => (c.id === client.id ? data.client : c)));
        }
      })
      .catch((err) => console.error("Failed to save client:", err));
  }, []);

  const updateClient = useCallback((client: Client) => {
    setClients((cs) => cs.map((c) => (c.id === client.id ? client : c))); // optimistic
    fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(client),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.client) {
          setClients((cs) => cs.map((c) => (c.id === client.id ? data.client : c)));
        }
      })
      .catch((err) => console.error("Failed to update client:", err));
  }, []);

  const deleteClients = useCallback((ids: string[]) => {
    setClients((cs) => cs.filter((c) => !ids.includes(c.id))); // optimistic
    fetch("/api/clients", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch((err) => console.error("Failed to delete clients:", err));
  }, []);

  const bulkSetClientStatus = useCallback(
    (ids: string[], status: ClientStatus) => {
      const updatedAt = new Date().toISOString();
      setClients((cs) => cs.map((c) => (ids.includes(c.id) ? { ...c, status, updatedAt } : c)));
      ids.forEach((id) => {
        const client = clients.find((c) => c.id === id);
        if (!client) return;
        fetch(`/api/clients/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...client, status, updatedAt }),
        }).catch((err) => console.error("Failed to update client status:", err));
      });
    },
    [clients]
  );

  const addMatter = useCallback((matter: Matter) => {
    setMatters((ms) => [...ms, matter]); // optimistic
    fetch("/api/matters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(matter),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.matter) {
          setMatters((ms) => ms.map((m) => (m.id === matter.id ? data.matter : m)));
        }
      })
      .catch((err) => console.error("Failed to save matter:", err));
  }, []);

  const updateMatter = useCallback((matter: Matter) => {
    setMatters((ms) => ms.map((m) => (m.id === matter.id ? matter : m))); // optimistic
    fetch(`/api/matters/${matter.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(matter),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.matter) {
          setMatters((ms) => ms.map((m) => (m.id === matter.id ? data.matter : m)));
        }
      })
      .catch((err) => console.error("Failed to update matter:", err));
  }, []);

  const deleteMatters = useCallback((ids: string[]) => {
    setMatters((ms) => ms.filter((m) => !ids.includes(m.id))); // optimistic
    fetch("/api/matters", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch((err) => console.error("Failed to delete matters:", err));
  }, []);

  const bulkSetMatterStatus = useCallback(
    (ids: string[], status: MatterStatus) => {
      const updatedAt = new Date().toISOString();
      setMatters((ms) => ms.map((m) => (ids.includes(m.id) ? { ...m, status, updatedAt } : m)));
      ids.forEach((id) => {
        const matter = matters.find((m) => m.id === id);
        if (!matter) return;
        fetch(`/api/matters/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...matter, status, updatedAt }),
        }).catch((err) => console.error("Failed to update matter status:", err));
      });
    },
    [matters]
  );

  return (
    <WorkspaceDataContext.Provider
      value={{
        clients,
        clientsLoaded,
        addClient,
        updateClient,
        deleteClients,
        bulkSetClientStatus,
        matters,
        mattersLoaded,
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
