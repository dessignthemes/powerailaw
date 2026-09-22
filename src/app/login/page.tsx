"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

const MICROSOFT_SCOPES = [
  "openid",
  "email",
  "profile",
  "offline_access",
  "User.Read",
  "Mail.Read",
  "Calendars.ReadWrite",
  "Files.Read",
].join(" ");

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
        scopes: provider === "google" ? GOOGLE_SCOPES : MICROSOFT_SCOPES,
        queryParams:
          provider === "google" ? { access_type: "offline", prompt: "consent" } : undefined,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="w-full max-w-[400px] bg-card-alt rounded-3xl p-8">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-8 h-8 rounded-md bg-dark text-white flex items-center justify-center text-[14px] font-bold font-display">
            P
          </div>
          <span className="font-display font-semibold text-[18px]">PowerAI Law</span>
        </div>

        <h1 className="text-[22px] font-semibold text-center mb-1.5">Sign in</h1>
        <p className="text-[14px] text-muted text-center mb-7">
          Use your firm&apos;s Google or Microsoft account.
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => handleLogin("google")}
            disabled={loading !== null}
            className="w-full bg-white border border-line rounded-full px-4 py-3 text-[14.5px] font-medium hover:bg-cream transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading === "google" ? "Redirecting…" : "Continue with Google"}
          </button>
          <button
            onClick={() => handleLogin("microsoft")}
            disabled={loading !== null}
            className="w-full bg-white border border-line rounded-full px-4 py-3 text-[14.5px] font-medium hover:bg-cream transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading === "microsoft" ? "Redirecting…" : "Continue with Microsoft"}
          </button>
        </div>

        {error && <p className="text-[13px] text-red-500 text-center mt-5">{error}</p>}

        <p className="text-[12.5px] text-muted text-center mt-7">
          Signing in also connects your mailbox and calendar so PowerAI Law can read matters and
          drafts from your inbox.
        </p>
      </div>
    </div>
  );
}
