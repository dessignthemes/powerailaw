"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import IntegrationsModal from "@/components/IntegrationsModal";

type IntegrationsModalContextValue = {
  openIntegrations: () => void;
};

const IntegrationsModalContext = createContext<IntegrationsModalContextValue | null>(null);

export function IntegrationsModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <IntegrationsModalContext.Provider value={{ openIntegrations: () => setOpen(true) }}>
      {children}
      {open && <IntegrationsModal onClose={() => setOpen(false)} />}
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
