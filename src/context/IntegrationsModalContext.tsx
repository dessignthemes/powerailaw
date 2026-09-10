"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import IntegrationsModal, { type SettingsTabKey } from "@/components/IntegrationsModal";

type IntegrationsModalContextValue = {
  openIntegrations: (tab?: SettingsTabKey) => void;
};

const IntegrationsModalContext = createContext<IntegrationsModalContextValue | null>(null);

export function IntegrationsModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<SettingsTabKey>("integrations");

  function openIntegrations(tab?: SettingsTabKey) {
    setInitialTab(tab ?? "integrations");
    setOpen(true);
  }

  return (
    <IntegrationsModalContext.Provider value={{ openIntegrations }}>
      {children}
      {open && <IntegrationsModal initialTab={initialTab} onClose={() => setOpen(false)} />}
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
