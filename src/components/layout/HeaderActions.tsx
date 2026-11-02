"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

// Puts a page's buttons in the top bar, next to the page switcher
// (the empty slot in src/app/dashboard/layout.tsx).
export const HEADER_SLOT_ID = "page-header-actions";
export const HEADER_RIGHT_SLOT_ID = "page-header-right"; // next to the alerts bell

const noop = () => () => {};
export default function HeaderActions({ children, side = "left" }: { children: React.ReactNode; side?: "left" | "right" }) {
  const id = side === "right" ? HEADER_RIGHT_SLOT_ID : HEADER_SLOT_ID;
  const slot = useSyncExternalStore(
    noop,
    () => document.getElementById(id),
    () => null
  );
  return slot ? createPortal(children, slot) : null;
}
