"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { allNavLinks, isActiveLink, navSections } from "@/lib/navigation";

// Same pages, order and sections as the sidebar (both read lib/navigation).
export default function PageSwitcher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const current = allNavLinks.find((p) => isActiveLink(p.href, pathname)) ?? allNavLinks[0];
  const CurrentIcon = current.icon;

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 bg-chip hover:bg-btn transition-colors px-3.5 py-2 rounded-full text-[13.5px] font-medium"
      >
        <CurrentIcon size={15} strokeWidth={1.75} />
        {current.label}
        <ChevronDown size={13} strokeWidth={2} className="text-muted ml-0.5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute left-0 top-[calc(100%+8px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] py-2 w-[240px] max-h-[calc(100vh-110px)] overflow-y-auto"
          >
            {navSections.map((section, i) => (
              <div key={section.title ?? "main"} className={`flex flex-col gap-[2px] ${i > 0 ? "mt-1 pt-1 border-t border-line" : ""}`}>
                {section.title && (
                  <div className="px-4 pt-1.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted">{section.title}</div>
                )}
                {section.links.map((p) => {
                  const Icon = p.icon;
                  const active = p.href === current.href;
                  return (
                    <Link
                      key={p.href}
                      href={p.href}
                      role="menuitem"
                      onClick={() => setOpen(false)}
                      className={`flex items-center justify-between gap-3 mx-1.5 px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-colors ${
                        active ? "bg-nav" : "hover:bg-nav"
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon size={15} strokeWidth={1.75} />
                        {p.label}
                      </span>
                      {active && <Check size={14} strokeWidth={2} />}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
