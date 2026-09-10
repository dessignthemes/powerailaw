"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const pages = [
  { label: "Dashboard", href: "/dashboard", icon: "⌂" },
  { label: "Triage", href: "/dashboard/inbox", icon: "☰" },
  { label: "Client intake", href: "/dashboard/clients", icon: "◎" },
  { label: "Records", href: "/dashboard/records", icon: "▤" },
  { label: "Task board", href: "/dashboard/task-board", icon: "▥" },
  { label: "Documents", href: "/dashboard/documents", icon: "▧" },
  { label: "Calendar", href: "/dashboard/calendar", icon: "▦" },
  { label: "Inbox", href: "/dashboard/inbox", icon: "✉" },
  { label: "Clients", href: "/dashboard/clients", icon: "◐" },
  { label: "Matters", href: "/dashboard/matters", icon: "⚖" },
];

export default function PageSwitcher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const current =
    pages.find((p) => p.href === pathname) ??
    pages.find((p) => pathname?.startsWith(p.href) && p.href !== "/dashboard") ??
    pages[0];

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-card-alt hover:bg-line/60 transition-colors px-3.5 py-2 rounded-full text-[13.5px] font-medium"
      >
        <span className="text-[13px]">{current.icon}</span>
        {current.label}
        <span className="text-[10px] text-muted ml-0.5">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+8px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] py-2 w-[240px]">
            {pages.map((p) => (
              <Link
                key={p.label}
                href={p.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px] font-medium hover:bg-card-alt transition-colors"
              >
                <span className="flex items-center gap-3">
                  <span className="w-4 text-center text-[13px]">{p.icon}</span>
                  {p.label}
                </span>
                {p.label === current.label && (
                  <span className="text-[13px] text-ink">✓</span>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
