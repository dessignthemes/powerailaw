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
  const persistRef = useRef<((l: LayoutItem[] | null) => void) | null>(null);
  // Oct 31: Tasks and Team progress became half the size (Extra large → Large); saved layouts follow once.
  const SHRUNK = "lawpower.dashboard.v2";
  const SHRUNK3 = "lawpower.dashboard.v3";
  const SHRUNK4 = "lawpower.dashboard.v4";
  const valid = (l: unknown): LayoutItem[] | null => {
    if (!Array.isArray(l)) return null;
    let list = (l as LayoutItem[]).filter((x) => x && typeof x.id === "string" && WIDGET(x.id));
    try {
      if (!localStorage.getItem(SHRUNK)) list = list.map((x) => ((x.id === "tasks" || x.id === "teamProgress") && x.size === "xl" ? { ...x, size: "l" } : x));
      // Oct 31 (later): Due today, Due by priority and Calendar became Small.
      if (!localStorage.getItem(SHRUNK3)) list = list.map((x) => (["due", "priority", "calendar"].includes(x.id) && x.size === "m" ? { ...x, size: "s" } : x));
      // Then Tasks, Recent activity, Team progress and Events became half as tall (Large → Medium).
      if (!localStorage.getItem(SHRUNK4)) list = list.map((x) => (["tasks", "activity", "teamProgress", "events"].includes(x.id) && (x.size === "l" || x.size === "xl") ? { ...x, size: "m" } : x));
    } catch {
      /* private mode */
    }
    return list;
  };

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
        try {
          if (!localStorage.getItem(SHRUNK) || !localStorage.getItem(SHRUNK3) || !localStorage.getItem(SHRUNK4)) {
            localStorage.setItem(SHRUNK, "1");
            localStorage.setItem(SHRUNK3, "1");
            localStorage.setItem(SHRUNK4, "1");
            if (server) persistRef.current?.(server);
          }
        } catch {
          /* private mode */
        }
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

  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);

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
