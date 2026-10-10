"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Lock } from "lucide-react";
import PortalHeader from "../PortalHeader";

const input = "w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none focus:border-btn-ring";

export default function PortalLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? "Couldn’t sign you in. Please try again.");
      router.push("/portal");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <PortalHeader />
      <main className="flex-1 flex items-start justify-center px-5 py-14">
        <div className="w-full max-w-[400px] bg-card-alt rounded-3xl p-8">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center mb-4"><Lock size={17} strokeWidth={1.75} /></div>
          <h1 className="text-[24px] font-semibold mb-1">Client sign in</h1>
          <p className="text-[13.5px] text-muted mb-6">See and download the documents your lawyer has shared with you.</p>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="grid gap-1">
              <span className="text-[13px] text-muted">Email</span>
              <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
            </label>
            <label className="grid gap-1">
              <span className="text-[13px] text-muted">Password</span>
              <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
            </label>
            {error && <div className="text-[13px] text-[#B42318]">{error}</div>}
            <button disabled={busy} className="mt-2 bg-dark text-white rounded-full py-2.5 text-[14.5px] font-medium hover:bg-dark2 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {busy && <Loader2 size={15} className="animate-spin" />} Sign in
            </button>
          </form>
          <div className="mt-6 text-[12.5px] text-muted leading-relaxed">
            <b className="text-ink">First time here?</b> Open the invite link in the email from your law firm to create your password.
            <br />
            <b className="text-ink">Forgot your password?</b> Ask your law firm to send you a new invite link.
          </div>
        </div>
      </main>
      <footer className="text-center text-[12px] text-muted py-6">
        Are you a lawyer? <a href="/login" className="underline underline-offset-2">Sign in to LawPower AI</a>
      </footer>
    </>
  );
}
