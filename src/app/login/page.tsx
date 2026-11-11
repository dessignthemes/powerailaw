"use client";

import LogoMark from "@/components/LogoMark";
import { Lock, Loader2 } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GOOGLE_FULL_SCOPES, MICROSOFT_FULL_SCOPES } from "@/lib/oauthScopes";

export default function LoginPage() {
  const [loading, setLoading] = useState<"google" | "microsoft" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(provider: "google" | "microsoft") {
    setError(null);
    setLoading(provider);
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOAuth({
      // Supabase's provider id for Microsoft/Entra ID is "azure".
      provider: provider === "microsoft" ? "azure" : "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: provider === "google" ? GOOGLE_FULL_SCOPES : MICROSOFT_FULL_SCOPES,
        queryParams:
          provider === "google" ? { access_type: "offline", prompt: "consent" } : undefined,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(null);
    }
  }

  const btn =
    "w-full bg-chip hover:bg-btn border border-btn text-ink rounded-full px-4 py-2.5 text-[14.5px] font-medium transition-colors flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="min-h-screen bg-page flex flex-col">
      <header className="bg-white border-b border-[#EBEAE7]">
        <div className="max-w-[960px] mx-auto px-5 h-[64px] flex items-center gap-2.5">
          <LogoMark size={32} />
          <span className="font-display font-semibold text-[17px]">LawPower AI</span>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-5 py-14">
        <div className="w-full max-w-[400px] bg-white border border-[#E9E7E4] rounded-3xl m-[7px] shadow-[0_0_0_6px_#F3F2F0,0_0_0_7px_#E8E6E2] p-8">
          <div className="w-10 h-10 rounded-xl bg-[#F3F2F0] border border-[#EBEAE7] flex items-center justify-center mb-4">
            <Lock size={17} strokeWidth={1.75} />
          </div>
          <h1 className="text-[24px] font-semibold mb-1">Sign in</h1>
          <p className="text-[13.5px] text-muted mb-6">Use your firm&apos;s Google or Microsoft account.</p>

          <div className="flex flex-col gap-3">
            <button onClick={() => handleLogin("google")} disabled={loading !== null} className={btn}>
              {loading === "google" ? <Loader2 size={16} className="animate-spin" /> : <GoogleMark />}
              {loading === "google" ? "Redirecting…" : "Continue with Google"}
            </button>
            <button onClick={() => handleLogin("microsoft")} disabled={loading !== null} className={btn}>
              {loading === "microsoft" ? <Loader2 size={16} className="animate-spin" /> : <MicrosoftMark />}
              {loading === "microsoft" ? "Redirecting…" : "Continue with Microsoft"}
            </button>
          </div>

          {error && <p className="text-[13px] text-[#B42318] mt-4">{error}</p>}

          <div className="mt-6 text-[12.5px] text-muted leading-relaxed">
            <b className="text-ink">Your mailbox and calendar:</b> signing in also connects them, so LawPower AI can read matters and drafts from your inbox.
          </div>
          <p className="text-[12px] text-muted mt-4 pt-4 border-t border-[#EBEAE7]">
            By signing in, you agree to the{" "}
            <a href="/terms" className="underline underline-offset-2 hover:text-ink">Terms of Service</a> and{" "}
            <a href="/privacy" className="underline underline-offset-2 hover:text-ink">Privacy Policy</a>.
          </p>
        </div>
      </main>

      <footer className="text-center text-[12px] text-muted py-6">
        Are you a client of a law firm?{" "}
        <a href="/portal/login" className="underline underline-offset-2 hover:text-ink">Client portal sign in</a>
      </footer>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function MicrosoftMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 21 21" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}
