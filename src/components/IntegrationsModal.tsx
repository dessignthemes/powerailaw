"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Settings,
  Shield,
  Grid3x3,
  Mail,
  Timer,
  X,
  ChevronRight,
} from "lucide-react";

const navItems = [
  { key: "general", label: "General", icon: Settings },
  { key: "security", label: "Security", icon: Shield },
  { key: "integrations", label: "Integrations", icon: Grid3x3 },
  { key: "mail", label: "Mail automation", icon: Mail },
  { key: "time", label: "Time tracking", icon: Timer },
] as const;

const connectors = [
  {
    key: "google",
    name: "Google Workspace",
    desc: "Gmail, Drive, and Calendar",
    icon: "G",
    href: null,
  },
  {
    key: "microsoft",
    name: "Microsoft 365",
    desc: "Outlook, OneDrive, and Calendar",
    icon: "◫",
    href: "/connect",
  },
  {
    key: "imap",
    name: "Email (IMAP)",
    desc: "Connect any other mailbox with an app password.",
    icon: "@",
    href: null,
  },
  {
    key: "telegram",
    name: "Telegram",
    desc: "Run your workspace from Telegram — manage tasks, create matters, and more.",
    icon: "✈",
    href: null,
  },
];

export default function IntegrationsModal({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState<(typeof navItems)[number]["key"]>("integrations");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-8">
      <div className="bg-cream rounded-3xl w-full max-w-[980px] max-h-[88vh] overflow-hidden flex">
        <div className="w-[220px] flex-shrink-0 border-r border-line px-4 py-6">
          <div className="text-[15px] font-semibold px-2 mb-5">Settings</div>
          <nav className="flex flex-col gap-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  onClick={() => setActive(item.key)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[14px] font-medium text-left transition-colors ${
                    active === item.key
                      ? "bg-card-alt text-ink"
                      : "text-muted hover:bg-card-alt hover:text-ink"
                  }`}
                >
                  <Icon size={16} strokeWidth={1.75} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between px-9 pt-8 pb-2">
            <div className="flex items-center gap-2 text-[14px] font-medium">
              <Grid3x3 size={15} strokeWidth={1.75} /> Integrations
            </div>
            <button onClick={onClose} className="text-muted hover:text-ink">
              <X size={20} strokeWidth={1.75} />
            </button>
          </div>

          <div className="px-9 pb-9">
            {active !== "integrations" ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="text-[15px] font-medium text-muted">
                  {navItems.find((n) => n.key === active)?.label} settings coming soon.
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-[26px] font-semibold mt-3 mb-1.5">Integrations</h2>
                <p className="text-[14px] text-muted mb-7">
                  Connect external services to your organization.
                </p>

                <div className="texture-beige rounded-3xl p-8 mb-8">
                  <div className="flex items-center gap-1.5 mb-5 text-[15px] font-semibold">
                    <span>@</span>
                    <span className="w-4 h-4 rounded-sm bg-dark text-white flex items-center justify-center text-[9px]">
                      P
                    </span>
                  </div>
                  <h3 className="text-[26px] font-semibold mb-3 leading-tight">
                    Import your entire client base
                    <br />
                    from your inbox
                  </h3>
                  <p className="text-[14px] text-muted mb-6 max-w-[440px]">
                    Outlook — emails, files, and events automatically turned into clients and
                    matters.
                  </p>
                  <div className="flex items-center gap-4 flex-wrap">
                    <Link
                      href="/connect"
                      className="bg-dark text-white px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors"
                    >
                      ↗ Import from Outlook
                    </Link>
                    <span className="text-[13.5px] font-medium text-ink underline cursor-pointer">
                      Learn more
                    </span>
                  </div>
                </div>

                <div className="flex flex-col divide-y divide-line border-t border-line">
                  {connectors.map((c) =>
                    c.href ? (
                      <Link
                        key={c.key}
                        href={c.href}
                        className="flex items-center justify-between py-4 hover:bg-card-alt transition-colors -mx-2 px-2 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-card-alt flex items-center justify-center text-[15px]">
                            {c.icon}
                          </div>
                          <div>
                            <div className="text-[14.5px] font-semibold">{c.name}</div>
                            <div className="text-[12.5px] text-muted">{c.desc}</div>
                          </div>
                        </div>
                        <ChevronRight size={16} strokeWidth={1.75} className="text-muted" />
                      </Link>
                    ) : (
                      <div key={c.key} className="flex items-center justify-between py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-card-alt flex items-center justify-center text-[15px]">
                            {c.icon}
                          </div>
                          <div>
                            <div className="text-[14.5px] font-semibold">{c.name}</div>
                            <div className="text-[12.5px] text-muted max-w-[440px]">{c.desc}</div>
                          </div>
                        </div>
                        <button className="bg-dark text-white px-4 py-2 rounded-full text-[13px] font-medium hover:bg-dark2 transition-colors flex-shrink-0">
                          Connect
                        </button>
                      </div>
                    )
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
