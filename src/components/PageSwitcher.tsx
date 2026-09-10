"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Home,
  Timer,
  UserPlus,
  ListChecks,
  Inbox,
  Calendar,
  Bookmark,
  BarChart3,
  Copy,
  CircleUser,
  Folder,
  Check,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";

const pages: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  { label: "Time tracking", href: "/dashboard/time-tracking", icon: Timer },
  { label: "Client intake", href: "/dashboard/client-intake", icon: UserPlus },
  { label: "Triage", href: "/dashboard/triage", icon: ListChecks },
  { label: "Records", href: "/dashboard/records", icon: Bookmark },
  { label: "Task board", href: "/dashboard/task-board", icon: BarChart3 },
  { label: "Documents", href: "/dashboard/documents", icon: Copy },
  { label: "Calendar", href: "/dashboard/calendar", icon: Calendar },
  { label: "Inbox", href: "/dashboard/inbox", icon: Inbox },
  { label: "Clients", href: "/dashboard/clients", icon: CircleUser },
  { label: "Matters", href: "/dashboard/matters", icon: Folder },
];

export default function PageSwitcher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const current =
    pages.find((p) => p.href === pathname) ??
    pages.find((p) => pathname?.startsWith(p.href) && p.href !== "/dashboard") ??
    pages[0];

  const CurrentIcon = current.icon;

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-card-alt hover:bg-line/60 transition-colors px-3.5 py-2 rounded-full text-[13.5px] font-medium"
      >
        <CurrentIcon size={15} strokeWidth={1.75} />
        {current.label}
        <ChevronDown size={13} strokeWidth={2} className="text-muted ml-0.5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+8px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] py-2 w-[240px]">
            {pages.map((p) => {
              const Icon = p.icon;
              return (
                <Link
                  key={p.label}
                  href={p.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px] font-medium hover:bg-card-alt transition-colors"
                >
                  <span className="flex items-center gap-3">
                    <Icon size={16} strokeWidth={1.75} />
                    {p.label}
                  </span>
                  {p.label === current.label && <Check size={14} strokeWidth={2} />}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
