import Sidebar from "@/components/Sidebar";
import { IntegrationsModalProvider } from "@/context/IntegrationsModalContext";
import { WorkspaceDataProvider } from "@/context/WorkspaceDataContext";
import UpdateBanner from "@/components/UpdateBanner";
import NotificationBell from "@/components/NotificationBell";
import ThemeToggle from "@/components/ThemeToggle";
import GlobalSearch from "@/components/GlobalSearch";
import BackgroundUploads from "@/components/documents/BackgroundUploads";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceDataProvider>
      <IntegrationsModalProvider>
        <div className="flex min-h-screen bg-sidebar">
          <Sidebar />
          <main className="flex-1 min-w-0 bg-page">
            <div className="px-10 pt-6 flex items-center justify-between gap-4">
              {/* Page switcher hidden for now; restore: <PageSwitcher /> */}
              <GlobalSearch />
              {/* A page's own buttons go here (HeaderActions). */}
              <div id="page-header-actions" className="flex-1 min-w-0 flex items-center gap-2 flex-wrap" />
              {/* Right side, in the widget style: a page's own controls (HeaderActions side="right") and the alerts bell. */}
              <div className="flex-shrink-0 bg-[#F2F0EA] border border-[#EBE8DF] rounded-full p-1 shadow-[0_2px_6px_-1px_rgba(27,25,26,0.07)]">
                <div className="bg-white border border-[#ECE9E1] rounded-full p-[2px] flex items-center gap-2 shadow-[0_1px_2px_rgba(27,25,26,0.05)]">
                  <div id="page-header-right" className="flex items-center gap-1.5 empty:hidden" />
                  <NotificationBell />
                  <ThemeToggle />
                </div>
              </div>
            </div>
            {children}
          </main>
        </div>
        <UpdateBanner />
        <BackgroundUploads />
      </IntegrationsModalProvider>
    </WorkspaceDataProvider>
  );
}
