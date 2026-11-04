"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "lp-theme";

// The theme lives on <html data-theme="dark">; this reads it and updates when it changes.
function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
const isDark = () => document.documentElement.dataset.theme === "dark";

function apply(on: boolean) {
  if (on) document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
}

// Light/dark switch in the top bar. Light by default; the choice is kept in this browser.
// Dark mode only applies inside the dashboard: leaving it (sign-in, portal) puts the page back to light.
export default function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  useEffect(() => {
    try {
      apply(localStorage.getItem(KEY) === "dark");
    } catch {}
    return () => apply(false);
  }, []);

  const toggle = () => {
    const next = !isDark();
    apply(next);
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {}
  };

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="lp-theme-btn w-[38px] h-[30px] rounded-full flex items-center justify-center transition-colors"
    >
      {dark ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
    </button>
  );
}
