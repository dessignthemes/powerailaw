import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Client portal · LawPower AI",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-page flex flex-col">{children}</div>;
}
