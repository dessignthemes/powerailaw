"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import PortalHeader from "../../PortalHeader";

const input = "w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none focus:border-btn-ring";
type Info = { firm: string; clientName: string; email: string; returning: boolean };

export default function PortalInvite({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
  const { token } = use(params);
  const [info, setInfo] = useState<Info | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/portal/invite/${token}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!live) return;
        if (!r.ok) setFatal(d?.error ?? "This invite link isn’t valid.");
        else setInfo(d);
      })
      .catch(() => live && setFatal("Couldn’t load this page. Check your connection and try again."));
    return () => {
      live = false;
    };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError("Use a password of at least 8 characters.");
    if (pw !== pw2) return setError("The two passwords don’t match.");
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/invite/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? "Something went wrong. Please try again.");
      router.push("/portal");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <PortalHeader firm={info?.firm} />
      <main className="flex-1 flex items-start justify-center px-5 py-14">
        <div className="w-full max-w-[420px] bg-card-alt rounded-3xl p-8">
          {fatal ? (
            <div className="text-center py-6">
              <div className="text-[16px] font-medium mb-2">{fatal}</div>
              <a href="/portal/login" className="text-[13.5px] underline underline-offset-2 text-muted">Go to client sign in</a>
            </div>
          ) : !info ? (
            <div className="flex items-center justify-center gap-2 text-muted text-[14px] py-10"><Loader2 size={15} className="animate-spin" /> Loading…</div>
          ) : (
            <>
              <h1 className="text-[24px] font-semibold mb-1">{info.returning ? "Set a new password" : `Welcome${info.clientName ? `, ${info.clientName.split(" ")[0]}` : ""}`}</h1>
              <p className="text-[13.5px] text-muted mb-6">
                {info.firm} invited you to their secure client portal, where you can see the documents they share with you.
                {info.returning ? "" : " Create a password to get started."}
              </p>
              <form onSubmit={submit} className="flex flex-col gap-3">
                <label className="grid gap-1">
                  <span className="text-[13px] text-muted">Your sign-in email</span>
                  <input value={info.email} readOnly className={`${input} bg-card-alt text-muted`} />
                </label>
                <label className="grid gap-1">
                  <span className="text-[13px] text-muted">Password (at least 8 characters)</span>
                  <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={input} />
                </label>
                <label className="grid gap-1">
                  <span className="text-[13px] text-muted">Repeat password</span>
                  <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={input} />
                </label>
                {error && <div className="text-[13px] text-[#B42318]">{error}</div>}
                <button disabled={busy} className="mt-2 bg-dark text-white rounded-full py-2.5 text-[14.5px] font-medium hover:bg-dark2 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  {busy && <Loader2 size={15} className="animate-spin" />} {info.returning ? "Save password & sign in" : "Create password & sign in"}
                </button>
              </form>
              <div className="mt-5 flex items-start gap-2 text-[12px] text-muted"><ShieldCheck size={14} className="flex-shrink-0 mt-px" /> Only you and your law firm can see your documents.</div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
