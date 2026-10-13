import Sidebar from "@/components/Sidebar";
import PageSwitcher from "@/components/PageSwitcher";
import { IntegrationsModalProvider } from "@/context/IntegrationsModalContext";
import { WorkspaceDataProvider } from "@/context/WorkspaceDataContext";
import UpdateBanner from "@/components/UpdateBanner";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceDataProvider>
      <IntegrationsModalProvider>
        <div className="flex min-h-screen bg-sidebar">
          <Sidebar />
          <main className="flex-1 min-w-0 bg-page">
            <div className="px-10 pt-6">
              <PageSwitcher />
            </div>
            {children}
          </main>
        </div>
        <UpdateBanner />
      </IntegrationsModalProvider>
    </WorkspaceDataProvider>
  );
}
