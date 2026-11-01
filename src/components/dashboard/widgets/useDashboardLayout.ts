"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_LAYOUT, LAYOUT_VERSION, WIDGET } from "./library";
import type { LayoutItem } from "./types";

// Each person's Dashboard layout: saved to their profile (migration 0066), and
// kept on this computer too so it appears instantly.
//
// A saved layout carries the layout version it was made under (a hidden
// { id: LAYOUT_VERSION } item). Layouts saved under an older version are
// replaced by the standard layout once; anything a person changes after that
// is saved under the current version and kept.
const isVersion = (x: { id: string }) => /^v\d+$/.test(x.id);

export function useDashboardLayout(meEmail: string | null) {
  const key = `lawpower.dashboard.layout.${(meEmail ?? "").toLowerCase()}`;
  const [layout, setLayoutState] = useState<LayoutItem[]>(DEFAULT_LAYOUT);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A saved layout, or null when it's missing or from an older version (→ the standard one).
  const current = (l: unknown): LayoutItem[] | null => {
    if (!Array.isArray(l)) return null;
    const list = l as LayoutItem[];
    if (!list.some((x) => x && x.id === LAYOUT_VERSION)) return null;
    return list.filter((x) => x && typeof x.id === "string" && !isVersion(x) && WIDGET(x.id));
  };

  useEffect(() => {
    if (!meEmail) return;
    let live = true;
    const t = setTimeout(() => {
      try {
        const local = current(JSON.parse(localStorage.getItem(key) ?? "null"));
        if (live) setLayoutState(local ?? DEFAULT_LAYOUT);
      } catch {
        /* nothing saved here */
      }
    }, 0);
    fetch("/api/me/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { layout?: unknown } | null) => {
        if (!live || !d) return;
        const server = current(d.layout);
        setLayoutState(server ?? DEFAULT_LAYOUT);
        try {
          if (server) localStorage.setItem(key, JSON.stringify([...server, { id: LAYOUT_VERSION, size: "s" }]));
          else localStorage.removeItem(key);
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
      const stored = l ? [...l, { id: LAYOUT_VERSION, size: "s" as const }] : null;
      try {
        if (stored) localStorage.setItem(key, JSON.stringify(stored));
        else localStorage.removeItem(key);
      } catch {
        /* private mode */
      }
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void fetch("/api/me/dashboard", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layout: stored }) }).catch(() => undefined);
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
