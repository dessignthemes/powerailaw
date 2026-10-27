"use client";

import LogoMark from "@/components/LogoMark";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import { useIntegrationsModal } from "@/context/IntegrationsModalContext";
import { createClient } from "@/lib/supabase/client";
import { Grid3x3, ArrowUpRight, PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";
import { mainLinks, toolLinks, workspaceLinks, isActiveLink } from "@/lib/navigation";
import AccountMenu from "@/components/AccountMenu";
import TaskBoardNav from "@/components/TaskBoardNav";
import AdminModal from "@/components/AdminModal";
import ContactSupportModal from "@/components/ContactSupportModal";

const ORG_NAME = "LawPower AI";

const COLLAPSED_KEY = "lawpower.sidebar.collapsed";

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  compact = false,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  compact?: boolean; // icon only (collapsed sidebar); the name shows on hover
}) {
  return (
    <Link
      href={href}
      title={compact ? label : undefined}
      aria-label={compact ? label : undefined}
      className={`flex items-center gap-2 py-[6px] rounded-lg text-[13px] font-medium transition-colors ${compact ? "justify-center px-0 h-8" : "px-3"} ${
        active ? "bg-nav text-ink" : "text-muted hover:bg-nav hover:text-ink"
      }`}
    >
      <Icon size={compact ? 17 : 15} strokeWidth={1.75} className="flex-shrink-0" />
      {!compact && label}
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { myRole } = useWorkspaceData();
  const router = useRouter();
  const { openIntegrations } = useIntegrationsModal();
  const [adminOpen, setAdminOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  // Collapsed = icons only. Remembered on this computer.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
      } catch {
        /* private mode */
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      } catch {
        /* private mode */
      }
      return !c;
    });

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
    <aside
      className={`${collapsed ? "w-[68px] px-2.5 py-4" : "w-[260px] px-4 py-6"} flex-shrink-0 bg-white border-r border-line h-screen sticky top-0 flex flex-col transition-[width] duration-200`}
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-2 mb-4">
          <LogoMark size={28} />
          <button onClick={toggleCollapsed} title="Expand menu" aria-label="Expand menu" className="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:bg-nav hover:text-ink transition-colors">
            <PanelLeftOpen size={17} strokeWidth={1.75} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 px-2 mb-8">
          <LogoMark size={28} />
          <span className="font-display font-semibold text-[16px] flex-1">LawPower AI</span>
          <button onClick={toggleCollapsed} title="Collapse menu" aria-label="Collapse menu" className="w-8 h-8 -mr-1 rounded-lg flex items-center justify-center text-muted hover:bg-nav hover:text-ink transition-colors">
            <PanelLeftClose size={16} strokeWidth={1.75} />
          </button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="mb-1 flex flex-col gap-[2px]">
          {mainLinks.map((l) => (
            <NavItem key={l.label} {...l} compact={collapsed} active={isActiveLink(l.href, pathname)} />
          ))}
        </div>

        <div className={`${collapsed ? "mt-2" : "mt-5"} mb-1 flex flex-col gap-[2px]`}>
          {collapsed ? (
            <div className="mx-2 mb-1.5 border-t border-line" />
          ) : (
            <div className="px-3 text-[10.5px] font-semibold uppercase tracking-wide text-muted mb-0.5">Tools</div>
          )}
          {toolLinks.filter((l) => !l.ownerOnly || myRole === "owner").map((l) => (
            <NavItem key={l.label} {...l} compact={collapsed} active={isActiveLink(l.href, pathname)} />
          ))}
        </div>

        <div className={`${collapsed ? "mt-2" : "mt-5"} mb-1 flex flex-col gap-[2px]`}>
          {collapsed ? (
            <div className="mx-2 mb-1.5 border-t border-line" />
          ) : (
            <div className="px-3 text-[10.5px] font-semibold uppercase tracking-wide text-muted mb-0.5">Workspace</div>
          )}
          {workspaceLinks.map((l) =>
            l.href === "/dashboard/task-board" && !collapsed ? (
              // Reads ?board=, so it needs its own Suspense boundary.
              <Suspense key={l.label} fallback={<NavItem {...l} active={pathname === l.href} />}>
                <TaskBoardNav />
              </Suspense>
            ) : (
              <NavItem key={l.label} {...l} compact={collapsed} active={isActiveLink(l.href, pathname)} />
            )
          )}
        </div>
      </nav>

      <div className={`border-t border-line ${collapsed ? "pt-2 mt-2" : "pt-4 mt-4"}`}>
        <button
          onClick={() => openIntegrations("integrations")}
          title={collapsed ? "Integrations" : undefined}
          aria-label={collapsed ? "Integrations" : undefined}
          className={`w-full flex items-center gap-2 py-[6px] rounded-lg text-[13px] font-medium text-muted hover:bg-nav hover:text-ink transition-colors mb-2 text-left ${collapsed ? "justify-center h-9" : "px-3"}`}
        >
          <Grid3x3 size={collapsed ? 17 : 15} strokeWidth={1.75} className="flex-shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1">Integrations</span>
              <ArrowUpRight size={14} strokeWidth={1.75} className="flex-shrink-0" />
            </>
          )}
        </button>
        <AccountMenu
          compact={collapsed}
          email={email ?? "…"}
          userName={fullName}
          orgName={ORG_NAME}
          onOpenAdmin={() => {
            setSupportOpen(false);
            setAdminOpen(true);
          }}
          onOpenTeam={() => {
            // Administration → Members, where new team members are invited.
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
        <AdminModal ownerEmail={email ?? ""} initialPage="members" onClose={() => setAdminOpen(false)} />
      )}
      {supportOpen && (
        <ContactSupportModal email={email ?? ""} onClose={() => setSupportOpen(false)} />
      )}
    </aside>
  );
}
