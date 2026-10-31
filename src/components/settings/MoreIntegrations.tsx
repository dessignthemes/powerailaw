"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, ChevronDown, ExternalLink, FileSignature, Printer, Calculator, Tablet, HardDrive, Cloud, Box } from "lucide-react";

// Settings → Integrations, below Google / Microsoft / AI assistants: files
// (Google Drive, OneDrive, Dropbox), e-signature and fax (Dropbox Sign, Dropbox
// Fax), accounting (QuickBooks) and devices (reMarkable).

type Status = {
  items: { provider: string; meta: { email?: string | null }; connectedAt: string }[];
  ready: boolean;
  dropbox: { configured: boolean; connected?: boolean; email?: string | null };
  quickbooksConfigured: boolean;
  canManage: boolean;
};

function Row({ icon, name, desc, right, children, open, onToggle }: { icon: React.ReactNode; name: string; desc: string; right: React.ReactNode; children?: React.ReactNode; open?: boolean; onToggle?: () => void }) {
  return (
    <div className="rounded-2xl bg-chip shadow-[0_1px_1px_rgba(27,25,26,0.08)]">
      <div className={`flex items-center justify-between gap-4 px-4 py-3.5 ${onToggle ? "cursor-pointer" : ""}`} onClick={onToggle}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-white/70 flex items-center justify-center flex-shrink-0">{icon}</div>
          <div className="min-w-0">
            <div className="text-[14.5px] font-semibold">{name}</div>
            <div className="text-[12.5px] text-muted">{desc}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {right}
          {onToggle && (
            <button onClick={onToggle} aria-label={open ? "Hide" : "Show more"} className="w-7 h-7 rounded-full hover:bg-white/70 flex items-center justify-center text-muted">
              <ChevronDown size={15} className={`transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
      </div>
      {open && children && <div className="px-4 pb-4 pt-0 text-[13px]">{children}</div>}
    </div>
  );
}

const pill = (text: string, tone: "ok" | "muted" = "muted") => (
  <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium ${tone === "ok" ? "bg-[#E7F6EE] text-[#155C3A]" : "bg-white/70 text-muted"}`}>
    {tone === "ok" && <Check size={12} />} {text}
  </span>
);

function KeyForm({ provider, label, canManage, onSaved, help }: { provider: "dropbox_sign" | "dropbox_fax"; label: string; canManage: boolean; onSaved: () => void; help: React.ReactNode }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, apiKey: key }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't connect.");
      setKey("");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="bg-white/70 rounded-xl p-3.5">
      <div className="text-muted mb-2">{help}</div>
      {canManage ? (
        <div className="flex gap-2">
          <input value={key} onChange={(e) => setKey(e.target.value.trim())} placeholder={`${label} API key`} type="password" autoComplete="off" aria-label={`${label} API key`} className="flex-1 bg-white border border-line rounded-full px-3.5 py-2 text-[13px] outline-none focus:border-btn-ring" />
          <button onClick={() => void save()} disabled={busy || key.length < 20} className="bg-btn hover:bg-btn-hover px-4 py-2 rounded-full text-[13px] font-medium disabled:opacity-50 flex items-center gap-1.5">
            {busy && <Loader2 size={13} className="animate-spin" />} Connect
          </button>
        </div>
      ) : (
        <div className="text-muted">Only the workspace owner or an admin can connect this.</div>
      )}
      {error && <div className="text-[#9F1D1D] mt-2">{error}</div>}
    </div>
  );
}

export default function MoreIntegrations({ onOpen }: { onOpen: (key: "google" | "microsoft") => void }) {
  const [s, setS] = useState<Status | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    fetch("/api/integrations")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Status | null) => d && setS(d))
      .catch(() => undefined);
  }, [reload]);
  const conn = (p: string) => s?.items.find((i) => i.provider === p);
  const toggle = (k: string) => setOpen((o) => (o === k ? null : k));
  async function disconnect(p: string) {
    if (!confirm("Disconnect it? The key is deleted from LawPower.")) return;
    await fetch(`/api/integrations?provider=${p}`, { method: "DELETE" });
    setReload((r) => r + 1);
  }
  const heading = (t: string) => <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted mt-5 mb-2 px-1">{t}</div>;
  const btn = "bg-btn hover:bg-btn-hover px-3.5 py-1.5 rounded-full text-[12.5px] font-medium flex items-center gap-1";
  const keyed = (p: "dropbox_sign" | "dropbox_fax") =>
    conn(p) ? (
      <>
        {pill(conn(p)!.meta.email ? `Connected · ${conn(p)!.meta.email}` : "Connected", "ok")}
        {s?.canManage && (
          <button onClick={() => void disconnect(p)} className="text-[12px] text-muted underline underline-offset-2 hover:text-ink">
            Disconnect
          </button>
        )}
      </>
    ) : (
      <button onClick={() => toggle(p)} className={btn}>
        Connect
      </button>
    );

  return (
    <div>
      {s && !s.ready && <div className="mt-4 rounded-xl bg-[#FFF4E5] text-[#8A4B14] px-4 py-2.5 text-[13px]">Dropbox Sign and Dropbox Fax need a database update first (migration 0065).</div>}

      {heading("Files")}
      <div className="flex flex-col gap-3">
        <Row icon={<HardDrive size={16} strokeWidth={1.75} />} name="Google Drive" desc="Part of Google Workspace: connect Google once and Drive comes with it." right={<button onClick={() => onOpen("google")} className={btn}>Open</button>} />
        <Row icon={<Cloud size={16} strokeWidth={1.75} />} name="OneDrive" desc="Part of Microsoft 365: connect Microsoft once and OneDrive comes with it." right={<button onClick={() => onOpen("microsoft")} className={btn}>Open</button>} />
        <Row
          icon={<Box size={16} strokeWidth={1.75} />}
          name="Dropbox"
          desc="Browse your Dropbox and file documents to matters. Each person connects their own."
          right={
            !s ? (
              <Loader2 size={14} className="animate-spin text-muted" />
            ) : s.dropbox.connected ? (
              pill(s.dropbox.email ? `Connected · ${s.dropbox.email}` : "Connected", "ok")
            ) : s.dropbox.configured ? (
              <a href="/api/dropbox/connect" className={btn}>
                Connect
              </a>
            ) : (
              pill("Waiting for Dropbox approval")
            )
          }
          open={open === "dropbox"}
          onToggle={s && !s.dropbox.configured ? () => toggle("dropbox") : undefined}
        >
          <div className="bg-white/70 rounded-xl p-3.5 text-muted">LawPower&apos;s Dropbox app is waiting for Dropbox&apos;s production approval. Once it&apos;s approved, the Connect button appears here.</div>
        </Row>
      </div>

      {heading("E-signature and fax")}
      <div className="flex flex-col gap-3">
        <Row icon={<FileSignature size={16} strokeWidth={1.75} />} name="Dropbox Sign" desc="Connect the firm's Dropbox Sign account for sending documents for e-signature." right={keyed("dropbox_sign")} open={open === "dropbox_sign"} onToggle={conn("dropbox_sign") ? undefined : () => toggle("dropbox_sign")}>
          <KeyForm
            provider="dropbox_sign"
            label="Dropbox Sign"
            canManage={!!s?.canManage}
            onSaved={() => (setOpen(null), setReload((r) => r + 1))}
            help={
              <>
                In Dropbox Sign, go to <b className="text-ink">Settings → API</b>, copy the API key and paste it here. LawPower checks it with Dropbox Sign before saving, and keeps it encrypted. (LawPower&apos;s own e-signature in Power PDF keeps working either way.)
              </>
            }
          />
        </Row>
        <Row icon={<Printer size={16} strokeWidth={1.75} />} name="Dropbox Fax" desc="Connect the firm's Dropbox Fax line for faxing documents from LawPower." right={keyed("dropbox_fax")} open={open === "dropbox_fax"} onToggle={conn("dropbox_fax") ? undefined : () => toggle("dropbox_fax")}>
          <KeyForm
            provider="dropbox_fax"
            label="Dropbox Fax"
            canManage={!!s?.canManage}
            onSaved={() => (setOpen(null), setReload((r) => r + 1))}
            help={
              <>
                Dropbox Fax uses the same API key as Dropbox Sign (<b className="text-ink">Settings → API</b>), with a fax line on your Dropbox plan.
              </>
            }
          />
        </Row>
      </div>

      {heading("Accounting")}
      <div className="flex flex-col gap-3">
        <Row
          icon={<Calculator size={16} strokeWidth={1.75} />}
          name="QuickBooks Online"
          desc="Send invoices and payments from AI Accountant to QuickBooks, and keep clients in step."
          right={s?.quickbooksConfigured ? pill("Ready to connect") : pill("Setup needed")}
          open={open === "qb"}
          onToggle={() => toggle("qb")}
        >
          <div className="bg-white/70 rounded-xl p-3.5 text-muted">
            QuickBooks connects through Intuit&apos;s sign-in, so LawPower needs its own app registered with Intuit (a free Intuit Developer account, then Intuit&apos;s review). Until then, AI Accountant&apos;s <b className="text-ink">accountant package</b> exports work with QuickBooks.{" "}
            <a href="https://developer.intuit.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-ink inline-flex items-center gap-0.5">
              Intuit Developer <ExternalLink size={11} />
            </a>
          </div>
        </Row>
      </div>

      {heading("Devices")}
      <div className="flex flex-col gap-3">
        <Row
          icon={<Tablet size={16} strokeWidth={1.75} />}
          name="reMarkable"
          desc="Read and mark up matter documents on your reMarkable tablet."
          right={pill("How it works")}
          open={open === "rm"}
          onToggle={() => toggle("rm")}
        >
          <div className="bg-white/70 rounded-xl p-3.5 text-muted">
            reMarkable has no public connection for other apps, but the tablet itself connects to <b className="text-ink">Google Drive, OneDrive and Dropbox</b> (on the tablet: Settings → Integrations, needs reMarkable Connect). Connect the same account here and in the tablet, and documents saved to that drive appear on the reMarkable. A one-click &ldquo;Send to reMarkable&rdquo; on documents can be added next.
          </div>
        </Row>
      </div>
    </div>
  );
}
