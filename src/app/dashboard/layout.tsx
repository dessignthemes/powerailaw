import Sidebar from "@/components/Sidebar";
import PageSwitcher from "@/components/PageSwitcher";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="px-10 pt-6">
          <PageSwitcher />
        </div>
        {children}
      </main>
    </div>
  );
}
