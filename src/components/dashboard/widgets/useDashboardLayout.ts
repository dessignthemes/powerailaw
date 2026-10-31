"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_LAYOUT, WIDGET } from "./library";
import type { LayoutItem } from "./types";

// Each person's Dashboard layout: saved to their profile (migration 0066), and
// kept on this computer too so it appears instantly and works before the update.
export function useDashboardLayout(meEmail: string | null) {
  const key = `lawpower.dashboard.layout.${(meEmail ?? "").toLowerCase()}`;
  const [layout, setLayoutState] = useState<LayoutItem[]>(DEFAULT_LAYOUT);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valid = (l: unknown): LayoutItem[] | null =>
    Array.isArray(l) ? (l as LayoutItem[]).filter((x) => x && typeof x.id === "string" && WIDGET(x.id)) : null;

  useEffect(() => {
    if (!meEmail) return;
    let live = true;
    const t = setTimeout(() => {
      try {
        const local = valid(JSON.parse(localStorage.getItem(key) ?? "null"));
        if (local && live) setLayoutState(local);
      } catch {
        /* nothing saved here */
      }
    }, 0);
    fetch("/api/me/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { layout?: unknown } | null) => {
        const server = valid(d?.layout);
        if (server && live) setLayoutState(server);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [meEmail, key]);

  const persist = useCallback(
    (l: LayoutItem[] | null) => {
      try {
        if (l) localStorage.setItem(key, JSON.stringify(l));
        else localStorage.removeItem(key);
      } catch {
        /* private mode */
      }
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void fetch("/api/me/dashboard", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layout: l }) }).catch(() => undefined);
      }, 600);
    },
    [key]
  );

  const setLayout = useCallback(
    (l: LayoutItem[]) => {
      setLayoutState(l);
      persist(l);
    },
    [persist]
  );
  const resetLayout = useCallback(() => {
    setLayoutState(DEFAULT_LAYOUT);
    persist(null);
  }, [persist]);
  return { layout, setLayout, resetLayout };
}
