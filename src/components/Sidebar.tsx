"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIntegrationsModal } from "@/context/IntegrationsModalContext";
import {
  Home,
  Sparkles,
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
  Settings,
  type LucideIcon,
} from "lucide-react";

const toolLinks: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Time tracking", href: "/dashboard/time-tracking", icon: Timer },
  { label: "Client Intake", href: "/dashboard/client-intake", icon: UserPlus },
  { label: "Triage", href: "/dashboard/inbox", icon: ListChecks },
];

const workspaceLinks: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Inbox", href: "/dashboard/inbox", icon: Inbox },
  { label: "Calendar", href: "/dashboard/calendar", icon: Calendar },
  { label: "Records", href: "/dashboard/records", icon: Bookmark },
  { label: "Task Board", href: "/dashboard/task-board", icon: BarChart3 },
  { label: "Documents", href: "/dashboard/documents", icon: Copy },
  { label: "Clients", href: "/dashboard/clients", icon: CircleUser },
  { label: "Matters", href: "/dashboard/matters", icon: Folder },
];

function NavItem({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[14px] font-medium transition-colors ${
        active ? "bg-card-alt text-ink" : "text-muted hover:bg-card-alt hover:text-ink"
      }`}
    >
      <Icon size={16} strokeWidth={1.75} className="flex-shrink-0" />
      {label}
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { openIntegrations } = useIntegrationsModal();

  return (
    <aside className="w-[260px] flex-shrink-0 bg-cream border-r border-line h-screen sticky top-0 flex flex-col px-4 py-6">
      <div className="flex items-center gap-2.5 px-2 mb-8">
        <div className="w-7 h-7 rounded-md bg-dark text-white flex items-center justify-center text-[13px] font-bold font-display">
          P
        </div>
        <span className="font-display font-semibold text-[16px]">PowerAI Law</span>
      </div>

      <nav className="flex-1 overflow-y-auto">
        <div className="mb-1">
          <NavItem
            href="/dashboard"
            icon={Home}
            label="Dashboard"
            active={pathname === "/dashboard"}
          />
          <NavItem
            href="/dashboard/agent"
            icon={Sparkles}
            label="AI Agent"
            active={pathname === "/dashboard/agent"}
          />
        </div>

        <div className="mt-6 mb-1">
          <div className="px-3 text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5">
            Tools
          </div>
          {toolLinks.map((l) => (
            <NavItem key={l.label} {...l} active={pathname === l.href} />
          ))}
        </div>

        <div className="mt-6 mb-1">
          <div className="px-3 text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5">
            Workspace
          </div>
          {workspaceLinks.map((l) => (
            <NavItem key={l.label} {...l} active={pathname === l.href} />
          ))}
        </div>
      </nav>

      <div className="border-t border-line pt-4 mt-4">
        <button
          onClick={openIntegrations}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[14px] font-medium text-muted hover:bg-card-alt hover:text-ink transition-colors mb-2 text-left"
        >
          <Settings size={16} strokeWidth={1.75} className="flex-shrink-0" />
          Integrations
        </button>
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="w-6 h-6 rounded-full bg-dark text-white flex items-center justify-center text-[11px] font-medium">
            P
          </div>
          <span className="text-[13px] text-muted truncate">you@yourfirm.com</span>
        </div>
      </div>
    </aside>
  );
}
