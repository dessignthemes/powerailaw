"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import IntegrationsModal, { type SettingsTabKey } from "@/components/IntegrationsModal";

type IntegrationsModalContextValue = {
  openIntegrations: (tab?: SettingsTabKey) => void;
};

const IntegrationsModalContext = createContext<IntegrationsModalContextValue | null>(null);

export function IntegrationsModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<SettingsTabKey>("integrations");
  const [justConnected, setJustConnected] = useState<string | null>(null);
  // Back from connecting Google / Microsoft (?settings=integrations&connected=microsoft):
  // open Settings → Integrations and say it's connected.
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get("settings") !== "integrations") return;
    const c = u.searchParams.get("connected");
    u.searchParams.delete("settings");
    u.searchParams.delete("connected");
    window.history.replaceState(null, "", u.pathname + (u.search || ""));
    const t = setTimeout(() => {
      setJustConnected(c === "google" || c === "microsoft" || c === "ringcentral" ? c : null);
      setInitialTab("integrations");
      setOpen(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  function openIntegrations(tab?: SettingsTabKey) {
    setInitialTab(tab ?? "integrations");
    setOpen(true);
  }

  return (
    <IntegrationsModalContext.Provider value={{ openIntegrations }}>
      {children}
      {open && <IntegrationsModal initialTab={initialTab} justConnected={justConnected} onClose={() => (setOpen(false), setJustConnected(null))} />}
    </IntegrationsModalContext.Provider>
  );
}

export function useIntegrationsModal() {
  const ctx = useContext(IntegrationsModalContext);
  if (!ctx) {
    throw new Error("useIntegrationsModal must be used within IntegrationsModalProvider");
  }
  return ctx;
}
