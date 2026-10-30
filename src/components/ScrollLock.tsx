"use client";

import { useEffect } from "react";

// While any pop-up window is open (a full-screen dimmed backdrop), the page
// behind it stays still: the mouse wheel scrolls only inside the pop-up.
// Works for every window in the app without each one having to do it.
const OVERLAY = '.fixed.inset-0[class*="bg-black/"]';

export default function ScrollLock() {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    let locked = false;
    const check = () => {
      frame = 0;
      const open = !!document.querySelector(OVERLAY);
      if (open === locked) return;
      locked = open;
      root.classList.toggle("lp-scroll-locked", open);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    const obs = new MutationObserver(schedule);
    obs.observe(document.body, { childList: true, subtree: true });
    check();
    return () => {
      obs.disconnect();
      if (frame) cancelAnimationFrame(frame);
      root.classList.remove("lp-scroll-locked");
    };
  }, []);
  return null;
}
