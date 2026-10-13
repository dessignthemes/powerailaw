"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";

// Shows a bar when LawPower has been updated since this tab was opened, so nobody
// keeps working in an old version without knowing.
export default function UpdateBanner() {
  const first = useRef<string | null>(null);
  const [outdated, setOutdated] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let stop = false;
    const check = () =>
      fetch("/api/version", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { version?: string } | null) => {
          if (stop || !d?.version || d.version === "dev") return;
          if (!first.current) first.current = d.version;
          else if (d.version !== first.current) setOutdated(true);
        })
        .catch(() => {});
    check();
    const timer = setInterval(check, 5 * 60_000);
    const onFocus = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      stop = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!outdated || hidden) return null;
  return (
    <div role="status" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-dark text-white rounded-full pl-5 pr-2 py-2 shadow-lg text-[13.5px]">
      LawPower has been updated.
      <button onClick={() => window.location.reload()} className="flex items-center gap-1.5 bg-white text-ink rounded-full px-3.5 py-1.5 font-medium hover:bg-chip">
        <RefreshCw size={13} /> Reload
      </button>
      <button onClick={() => setHidden(true)} aria-label="Later" className="w-7 h-7 rounded-full hover:bg-white/15 flex items-center justify-center">
        <X size={14} />
      </button>
    </div>
  );
}
