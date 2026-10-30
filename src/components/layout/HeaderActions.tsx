"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

// Puts a page's buttons in the top bar, next to the page switcher
// (the empty slot in src/app/dashboard/layout.tsx).
export const HEADER_SLOT_ID = "page-header-actions";

const noop = () => () => {};
export default function HeaderActions({ children }: { children: React.ReactNode }) {
  const slot = useSyncExternalStore(
    noop,
    () => document.getElementById(HEADER_SLOT_ID),
    () => null
  );
  return slot ? createPortal(children, slot) : null;
}
