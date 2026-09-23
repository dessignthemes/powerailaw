"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  GOOGLE_BASE_SCOPES,
  MICROSOFT_BASE_SCOPES,
  GOOGLE_MAILBOX_ITEMS,
  MICROSOFT_MAILBOX_ITEMS,
} from "@/lib/oauthScopes";

type Provider = "microsoft" | "google";

function ConnectPageInner() {
  const searchParams = useSearchParams();
  const initialProvider = searchParams.get("provider") === "google" ? "google" : "microsoft";

  const [provider, setProvider] = useState<Provider>(initialProvider);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = provider === "google" ? GOOGLE_MAILBOX_ITEMS : MICROSOFT_MAILBOX_ITEMS;

  const [selected, setSelected] = useState<Record<Provider, Record<string, boolean>>>({
    microsoft: Object.fromEntries(MICROSOFT_MAILBOX_ITEMS.map((i) => [i.key, true])),
    google: Object.fromEntries(GOOGLE_MAILBOX_ITEMS.map((i) => [i.key, true])),
  });

  const currentSelected = selected[provider];
  const count = Object.values(currentSelected).filter(Boolean).length;

  async function handleConnect() {
    setError(null);
    setConnecting(true);
    const supabase = createClient();

    const baseScopes = provider === "google" ? GOOGLE_BASE_SCOPES : MICROSOFT_BASE_SCOPES;
    const chosenScopes = items.filter((i) => currentSelected[i.key]).map((i) => i.scope);
    const scopes = [...baseScopes, ...chosenScopes].join(" ");

    // Return to the page that sent us here (e.g. the Inbox) after connecting.
    const back = searchParams.get("next");
    if (back && back.startsWith("/") && !back.startsWith("//")) {
      document.cookie = `post_auth_next=${encodeURIComponent(back)}; path=/; max-age=600; samesite=lax`;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider === "microsoft" ? "azure" : "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes,
        queryParams: provider === "google" ? { access_type: "offline", prompt: "consent" } : undefined,
      },
    });

    if (error) {
      setError(error.message);
      setConnecting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-6 py-16">
      <div className="max-w-[560px] w-full text-center">
        <h1 className="font-display text-[38px] font-semibold mb-3">
          Connect your practice
        </h1>
        <p className="text-[15px] text-muted leading-relaxed mb-10">
          Connect your mail, calendar and files. PowerAI Law sets up your
          intake routing from them in minutes.
        </p>

        <div className="bg-white border border-line rounded-3xl p-2 mb-6">
          <div className="grid grid-cols-2 gap-2 p-2">
            <button
              onClick={() => setProvider("microsoft")}
              className={`rounded-xl py-2.5 text-[14px] font-medium transition-colors ${
                provider === "microsoft" ? "bg-card-alt" : "text-muted hover:text-ink"
              }`}
            >
              Microsoft 365
            </button>
            <button
              onClick={() => setProvider("google")}
              className={`rounded-xl py-2.5 text-[14px] font-medium transition-colors ${
                provider === "google" ? "bg-card-alt" : "text-muted hover:text-ink"
              }`}
            >
              Google
            </button>
          </div>

          <div className="flex flex-col divide-y divide-line px-2">
            {items.map((item) => (
              <label
                key={item.key}
                className="flex items-start justify-between gap-4 py-5 px-3 cursor-pointer text-left"
              >
                <div>
                  <div className="text-[15px] font-semibold mb-1">{item.label}</div>
                  <div className="text-[13px] text-muted leading-relaxed">{item.desc}</div>
                </div>
                <input
                  type="checkbox"
                  checked={currentSelected[item.key]}
                  onChange={(e) =>
                    setSelected((s) => ({
                      ...s,
                      [provider]: { ...s[provider], [item.key]: e.target.checked },
                    }))
                  }
                  className="mt-1 w-[18px] h-[18px] accent-black flex-shrink-0"
                />
              </label>
            ))}
          </div>

          <div className="p-3">
            <button
              onClick={handleConnect}
              disabled={connecting || count === 0}
              className="block w-full bg-dark text-white text-center py-3.5 rounded-2xl text-[14.5px] font-semibold hover:bg-dark2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {connecting ? "Redirecting…" : `Connect ${count} selected`}
            </button>
            <a
              href="/dashboard"
              className="block w-full text-center py-3 text-[13.5px] text-muted hover:text-ink transition-colors"
            >
              I&rsquo;ll connect later
            </a>
          </div>
        </div>

        {error && <p className="text-[13px] text-red-500 mb-4">{error}</p>}

        <div className="flex items-center justify-center gap-1.5 text-[12.5px] text-muted">
          <span>🔒</span> Privacy first. Never used to train AI, seen only by your firm.
        </div>
      </div>
    </div>
  );
}

export default function ConnectPage() {
  return (
    <Suspense fallback={null}>
      <ConnectPageInner />
    </Suspense>
  );
}
