"use client";

import { useEffect, useState } from "react";
import { Loader2, ExternalLink, CheckCircle2 } from "lucide-react";

type Settings = { lawpayOperatingUrl: string; lawpayTrustUrl: string };

// Administration → Online payments: the firm's LawPay payment page links.
export default function PaymentsPanel() {
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/admin/payments")
      .then((r) => r.json())
      .then((d) => live && setS(d.settings ?? { lawpayOperatingUrl: "", lawpayTrustUrl: "" }))
      .catch(() => live && setS({ lawpayOperatingUrl: "", lawpayTrustUrl: "" }));
    return () => {
      live = false;
    };
  }, []);

  async function save() {
    if (!s) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/payments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? "Couldn't save.");
      setS(d.settings);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full bg-white border border-line rounded-lg px-3 py-2 text-[13.5px] outline-none focus:border-btn-ring";
  const field = (key: keyof Settings, label: string, hint: string) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-[14px] font-semibold">{label}</span>
      <span className="text-[12.5px] text-muted">{hint}</span>
      <div className="flex gap-2">
        <input value={s?.[key] ?? ""} onChange={(e) => s && (setS({ ...s, [key]: e.target.value }), setSaved(false))} placeholder="https://secure.lawpay.com/pages/…" className={input} />
        {s?.[key] && (
          <a href={s[key]} target="_blank" rel="noopener noreferrer" title="Open the page" className="flex items-center px-3 rounded-lg bg-chip hover:bg-btn text-muted">
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </label>
  );

  return (
    <>
      <h2 className="text-[26px] font-semibold mt-1 mb-1.5">Online payments</h2>
      <p className="text-[14px] text-muted mb-6 max-w-[680px]">
        Connect your LawPay payment pages. Invoices then show a <b>Pay online</b> button, and the client portal shows <b>Make a payment</b>. Clients pay by card or eCheck on
        LawPay&apos;s secure page; LawPower never sees card details.
      </p>
      {!s ? (
        <div className="text-[14px] text-muted flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : (
        <div className="flex flex-col gap-5 max-w-[720px]">
          <div className="border border-line rounded-2xl p-5 bg-white flex flex-col gap-5">
            {field("lawpayOperatingUrl", "Operating account payment page", "For invoices (earned fees). Shown as Pay online on every invoice.")}
            {field("lawpayTrustUrl", "Trust (IOLTA) account payment page", "For retainers and other client money held in trust. Shown in the client portal as a separate option.")}
            {error && <div className="rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-2.5 text-[13px]">{error}</div>}
            <div className="flex items-center gap-3">
              <button onClick={() => void save()} disabled={busy} className="bg-btn hover:bg-btn-hover disabled:opacity-50 px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-2">
                {busy && <Loader2 size={14} className="animate-spin" />} Save
              </button>
              {saved && (
                <span className="text-[13px] text-[#155C3A] flex items-center gap-1.5">
                  <CheckCircle2 size={14} /> Saved
                </span>
              )}
            </div>
          </div>
          <div className="text-[13px] text-muted leading-relaxed">
            <b className="text-ink">Where to find the links:</b> sign in to LawPay → <b>Payment Pages</b> (or <b>Get Paid → Payment Page</b>) → copy the page&apos;s web address. If you
            have one page for both accounts, paste it in the Operating box and leave Trust empty.
            <br />
            <b className="text-ink">After a client pays:</b> import LawPay&apos;s transaction report in AI Accountant (+ Add → Import from LawPay) and payments are matched to invoices
            for you.
          </div>
        </div>
      )}
    </>
  );
}
