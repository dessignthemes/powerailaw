import Link from "next/link";
import LogoMark from "@/components/LogoMark";

export default function PortalHeader({ firm, right }: { firm?: string; right?: React.ReactNode }) {
  return (
    <header className="bg-white border-b border-line">
      <div className="max-w-[960px] mx-auto px-5 h-[64px] flex items-center justify-between gap-4">
        <Link href="/portal" className="flex items-center gap-2.5 min-w-0">
          <LogoMark size={28} />
          <span className="min-w-0">
            <span className="block text-[14.5px] font-semibold truncate">{firm || "Client portal"}</span>
            <span className="block text-[11.5px] text-muted -mt-0.5">Client portal · LawPower AI</span>
          </span>
        </Link>
        {right}
      </div>
    </header>
  );
}
