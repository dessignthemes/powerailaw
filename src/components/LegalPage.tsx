import Link from "next/link";

// Shared layout for public legal pages (/privacy, /terms).
export const PRIVACY_EMAIL = "privacy@lawpower.ai";
export const SUPPORT_EMAIL = "support@lawpower.ai";
export const LEGAL_UPDATED = "October 6, 2026";

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[19px] font-semibold mt-10 mb-3">{children}</h2>;
}
export function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[15.5px] font-semibold mt-6 mb-2">{children}</h3>;
}
export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-ink/90 mb-3">{children}</p>;
}
export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-6 mb-3 space-y-1.5 text-[15px] leading-relaxed text-ink/90">{children}</ul>;
}

export function Mail({ to }: { to: string }) {
  return (
    <a href={`mailto:${to}`} className="underline underline-offset-2">
      {to}
    </a>
  );
}

export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-line">
        <div className="max-w-[820px] mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-semibold text-[16px]">
            <span className="w-8 h-8 rounded-md bg-dark text-white flex items-center justify-center text-[15px] font-bold">L</span>
            LawPower AI
          </Link>
          <nav className="flex gap-5 text-[14px] text-muted">
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <Link href="/login" className="hover:text-ink">Sign in</Link>
          </nav>
        </div>
      </header>
      <main className="max-w-[820px] mx-auto px-6 py-12">
        <h1 className="text-[34px] font-semibold tracking-tight">{title}</h1>
        <p className="text-[14px] text-muted mt-2 mb-8">Last updated: {LEGAL_UPDATED}</p>
        {children}
        <p className="text-[14px] text-muted mt-12 border-t border-line pt-6">
          Privacy questions: <Mail to={PRIVACY_EMAIL} /> · Help with LawPower: <Mail to={SUPPORT_EMAIL} />
        </p>
      </main>
    </div>
  );
}
