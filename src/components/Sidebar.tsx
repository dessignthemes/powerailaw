"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import { useIntegrationsModal } from "@/context/IntegrationsModalContext";
import { createClient } from "@/lib/supabase/client";
import {
  Home,
  Sparkles,
  Users,
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
  Grid3x3,
  FilePen,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import AccountMenu from "@/components/AccountMenu";
import TaskBoardNav from "@/components/TaskBoardNav";
import AdminModal from "@/components/AdminModal";
import ContactSupportModal from "@/components/ContactSupportModal";

const toolLinks: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Time tracking", href: "/dashboard/time-tracking", icon: Timer },
  { label: "Client Intake", href: "/dashboard/client-intake", icon: UserPlus },
  { label: "Triage", href: "/dashboard/triage", icon: ListChecks },
  { label: "Power PDF", href: "/dashboard/power-pdf", icon: FilePen },
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

const ORG_NAME = "LawPower AI";

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
  const router = useRouter();
  const { openIntegrations } = useIntegrationsModal();
  const [adminOpen, setAdminOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      // Name from the Google / Microsoft profile, when the provider shares it.
      const meta = data.user?.user_metadata ?? {};
      setFullName((meta.full_name || meta.name || null) as string | null);
    });
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside className="w-[260px] flex-shrink-0 bg-cream border-r border-line h-screen sticky top-0 flex flex-col px-4 py-6">
      <div className="flex items-center gap-2.5 px-2 mb-8">
        <div className="w-7 h-7 rounded-md bg-dark text-white flex items-center justify-center text-[13px] font-bold font-display">
          L
        </div>
        <span className="font-display font-semibold text-[16px]">LawPower AI</span>
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
          <NavItem
            href="/dashboard/community"
            icon={Users}
            label="Community"
            active={pathname === "/dashboard/community"}
          />
        </div>

        <div className="mt-6 mb-1">
          <div className="px-3 text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5">
            Tools
          </div>
          {toolLinks.map((l) => (
            <NavItem key={l.label} {...l} active={pathname === l.href || pathname.startsWith(l.href + "/")} />
          ))}
        </div>

        <div className="mt-6 mb-1">
          <div className="px-3 text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5">
            Workspace
          </div>
          {workspaceLinks.map((l) =>
            l.href === "/dashboard/task-board" ? (
              // Reads ?board=, so it needs its own Suspense boundary.
              <Suspense key={l.label} fallback={<NavItem {...l} active={pathname === l.href} />}>
                <TaskBoardNav />
              </Suspense>
            ) : (
              <NavItem key={l.label} {...l} active={pathname === l.href || pathname.startsWith(l.href + "/")} />
            )
          )}
        </div>
      </nav>

      <div className="border-t border-line pt-4 mt-4">
        <button
          onClick={() => openIntegrations("integrations")}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[14px] font-medium text-muted hover:bg-card-alt hover:text-ink transition-colors mb-2 text-left"
        >
          <Grid3x3 size={16} strokeWidth={1.75} className="flex-shrink-0" />
          <span className="flex-1">Integrations</span>
          <ArrowUpRight size={14} strokeWidth={1.75} className="flex-shrink-0" />
        </button>
        <AccountMenu
          email={email ?? "…"}
          userName={fullName}
          orgName={ORG_NAME}
          onOpenAdmin={() => {
            setSupportOpen(false);
            setAdminOpen(true);
          }}
          onOpenSupport={() => {
            setAdminOpen(false);
            setSupportOpen(true);
          }}
          onLogout={handleLogout}
        />
      </div>

      {adminOpen && (
        <AdminModal ownerEmail={email ?? ""} onClose={() => setAdminOpen(false)} />
      )}
      {supportOpen && (
        <ContactSupportModal email={email ?? ""} onClose={() => setSupportOpen(false)} />
      )}
    </aside>
  );
}
