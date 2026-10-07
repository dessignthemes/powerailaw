"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import { useIntegrationsModal } from "@/context/IntegrationsModalContext";
import { createClient } from "@/lib/supabase/client";
import { Grid3x3, ArrowUpRight, type LucideIcon } from "lucide-react";
import { mainLinks, toolLinks, workspaceLinks, isActiveLink } from "@/lib/navigation";
import AccountMenu from "@/components/AccountMenu";
import TaskBoardNav from "@/components/TaskBoardNav";
import AdminModal from "@/components/AdminModal";
import ContactSupportModal from "@/components/ContactSupportModal";

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
        active ? "bg-chip text-ink" : "text-muted hover:bg-chip hover:text-ink"
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
    <aside className="w-[260px] flex-shrink-0 bg-sidebar border-r border-line h-screen sticky top-0 flex flex-col px-4 py-6">
      <div className="flex items-center gap-2.5 px-2 mb-8">
        <div className="w-7 h-7 rounded-md bg-dark text-white flex items-center justify-center text-[13px] font-bold font-display">
          L
        </div>
        <span className="font-display font-semibold text-[16px]">LawPower AI</span>
      </div>

      <nav className="flex-1 overflow-y-auto">
        <div className="mb-1">
          {mainLinks.map((l) => (
            <NavItem key={l.label} {...l} active={isActiveLink(l.href, pathname)} />
          ))}
        </div>

        <div className="mt-6 mb-1">
          <div className="px-3 text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5">
            Tools
          </div>
          {toolLinks.map((l) => (
            <NavItem key={l.label} {...l} active={isActiveLink(l.href, pathname)} />
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
              <NavItem key={l.label} {...l} active={isActiveLink(l.href, pathname)} />
            )
          )}
        </div>
      </nav>

      <div className="border-t border-line pt-4 mt-4">
        <button
          onClick={() => openIntegrations("integrations")}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[14px] font-medium text-muted hover:bg-chip hover:text-ink transition-colors mb-2 text-left"
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
