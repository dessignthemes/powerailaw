"use client";

import { useEffect, useState } from "react";
import { X, Loader2, PenLine, Type, CalendarDays, User, SquareCheck, Signature, Copy, Check, Mail } from "lucide-react";
import PdfPages from "@/components/esign/PdfPages";
import { fetchVersionBytes } from "@/lib/pdf/upload";
import { FIELD_META, type FieldType, type SignField } from "@/lib/esign/types";

const TOOLS: { type: FieldType; icon: typeof PenLine }[] = [
  { type: "signature", icon: Signature },
  { type: "initials", icon: PenLine },
  { type: "date", icon: CalendarDays },
  { type: "name", icon: User },
  { type: "text", icon: Type },
  { type: "checkbox", icon: SquareCheck },
];
const input = "w-full border border-line rounded-lg px-3 py-2 text-[14px] bg-white outline-none focus:border-ink placeholder:text-muted/70";
const PAGE_W = 720;

export default function SendForSignature({
  documentId,
  versionId,
  title,
  defaultSigner,
  onClose,
  onSent,
}: {
  documentId: string;
  versionId: string;
  title: string;
  defaultSigner: { name: string; email: string };
  onClose: () => void;
  onSent: () => void;
}) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tool, setTool] = useState<FieldType>("signature");
  const [fields, setFields] = useState<SignField[]>([]);
  const [name, setName] = useState(defaultSigner.name);
  const [email, setEmail] = useState(defaultSigner.email);
  const [message, setMessage] = useState(`Please review and sign "${title}".`);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchVersionBytes(versionId)
      .then((b) => !cancelled && setBytes(b))
      .catch(() => !cancelled && setLoadError("The document couldn't be loaded."));
    return () => {
      cancelled = true;
    };
  }, [versionId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  function place(page: number, fx: number, fy: number) {
    const m = FIELD_META[tool];
    const x = Math.min(1 - m.w, Math.max(0, fx - m.w / 2));
    const y = Math.min(1 - m.h, Math.max(0, fy - m.h / 2));
    setFields((f) => [...f, { id: Math.random().toString(36).slice(2, 10), type: tool, page, x, y, w: m.w, h: m.h, label: m.label, required: tool !== "checkbox" && tool !== "text" }]);
  }

  function drag(e: React.PointerEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY };
    const orig = fields.find((f) => f.id === id)!;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / box.width;
      const dy = (ev.clientY - start.y) / box.height;
      setFields((list) => list.map((f) => (f.id === id ? { ...f, x: Math.min(1 - f.w, Math.max(0, orig.x + dx)), y: Math.min(1 - f.h, Math.max(0, orig.y + dy)) } : f)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/esign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, versionId, signerName: name, signerEmail: email, message, fields, expiresInDays: days }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? "The request couldn't be sent.");
      setLink(d.link);
      onSent();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const mailto = link
    ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Please sign: ${title}`)}&body=${encodeURIComponent(
        `Hello ${name},\n\n${message}\n\nOpen this secure link to review and sign:\n${link}\n\nThe link is personal to you and expires in ${days} days.\n`
      )}`
    : "";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex">
      <div className="m-auto w-[min(1280px,96vw)] h-[94vh] bg-cream rounded-2xl shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <div className="min-w-0">
            <div className="text-[18px] font-semibold">Send for signature</div>
            <div className="text-[13px] text-muted truncate">{title}</div>
          </div>
          <button onClick={onClose} disabled={busy} className="text-muted hover:text-ink" aria-label="Close"><X size={20} /></button>
        </div>

        {link ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-[560px] w-full bg-white border border-line rounded-2xl p-7">
              <div className="flex items-center gap-2 text-[17px] font-semibold mb-1"><Check size={18} className="text-green-700" /> Ready to send</div>
              <p className="text-[13.5px] text-muted mb-5">Send this secure link to {name}. When they sign, the signed PDF is saved as a new version of this document, with a signature certificate page.</p>
              <div className="flex gap-2 mb-4">
                <input readOnly value={link} className={`${input} font-mono text-[12.5px]`} onFocus={(e) => e.target.select()} />
                <button onClick={() => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="bg-chip hover:bg-btn px-3.5 rounded-lg text-[13px] font-medium flex items-center gap-1.5">
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="flex gap-2 justify-end">
                <a href={mailto} className="bg-btn hover:bg-btn-hover px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5"><Mail size={14} /> Email it to {name.split(" ")[0] || "the client"}</a>
                <button onClick={onClose} className="bg-chip hover:bg-btn px-4 py-2 rounded-full text-[13.5px] font-medium">Done</button>
              </div>
              <p className="text-[12px] text-muted mt-4">“Email it” opens a ready-made email in your own mail app, so it comes from your address.</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-[1fr_330px] min-h-0">
            <div className="flex flex-col min-h-0">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-line bg-white flex-wrap">
                <span className="text-[12.5px] text-muted mr-1">Choose a field, then click on the page:</span>
                {TOOLS.map((t) => (
                  <button key={t.type} onClick={() => setTool(t.type)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium ${tool === t.type ? "bg-btn" : "bg-chip hover:bg-btn"}`}>
                    <t.icon size={14} /> {FIELD_META[t.type].label}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-auto p-6 bg-card-alt/50">
                {loadError ? (
                  <div className="py-16 text-center text-[14px] text-red-700">{loadError}</div>
                ) : !bytes ? (
                  <div className="py-16 flex items-center justify-center gap-2 text-[14px] text-muted"><Loader2 size={16} className="animate-spin" /> Loading document…</div>
                ) : (
                  <div className="cursor-crosshair">
                    <PdfPages
                      bytes={bytes}
                      width={PAGE_W}
                      onPageClick={place}
                      overlay={(page) =>
                        fields.filter((f) => f.page === page).map((f) => (
                          <div
                            key={f.id}
                            onPointerDown={(e) => drag(e, f.id)}
                            className="absolute pointer-events-auto cursor-move rounded-md border-2 border-[#3B6BA5] bg-[#3B6BA5]/10 text-[#1f3a93] text-[11px] font-medium flex items-center justify-center select-none"
                            style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}
                            title="Drag to move"
                          >
                            <span className="truncate px-1">{f.type === "checkbox" ? "☐" : f.label}{f.required && f.type !== "checkbox" ? " *" : ""}</span>
                            <button
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={() => setFields((l) => l.filter((x) => x.id !== f.id))}
                              className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-white border border-line flex items-center justify-center text-muted hover:text-red-700"
                              aria-label="Remove field"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ))
                      }
                    />
                  </div>
                )}
              </div>
            </div>

            <aside className="border-l border-line bg-white p-5 overflow-y-auto">
              <div className="text-[13px] font-semibold uppercase tracking-wide text-muted mb-3">Signer</div>
              <label className="grid gap-1 mb-3"><span className="text-[13px] text-muted">Full name</span><input value={name} onChange={(e) => setName(e.target.value)} className={input} /></label>
              <label className="grid gap-1 mb-3"><span className="text-[13px] text-muted">Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} /></label>
              <label className="grid gap-1 mb-3"><span className="text-[13px] text-muted">Message</span><textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className={`${input} resize-none`} /></label>
              <label className="grid gap-1 mb-5">
                <span className="text-[13px] text-muted">Link expires after</span>
                <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={input}>
                  {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
                </select>
              </label>

              <div className="text-[13px] font-semibold uppercase tracking-wide text-muted mb-2">Fields ({fields.length})</div>
              {fields.length === 0 ? (
                <p className="text-[13px] text-muted mb-4">Click on the document to add fields. Add at least one signature.</p>
              ) : (
                <div className="grid gap-1.5 mb-4 max-h-[240px] overflow-y-auto">
                  {fields.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 text-[13px] bg-card-alt/60 rounded-lg px-2.5 py-1.5">
                      <span className="flex-1 truncate">{f.label} · page {f.page}</span>
                      {f.type !== "date" && f.type !== "signature" && (
                        <label className="flex items-center gap-1 text-[12px] text-muted">
                          <input type="checkbox" checked={f.required} onChange={(e) => setFields((l) => l.map((x) => (x.id === f.id ? { ...x, required: e.target.checked } : x)))} className="accent-black" /> required
                        </label>
                      )}
                      <button onClick={() => setFields((l) => l.filter((x) => x.id !== f.id))} className="text-muted hover:text-red-700" aria-label="Remove"><X size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
              {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div>}
              <button
                onClick={send}
                disabled={busy || !fields.some((f) => f.type === "signature") || !name.trim() || !email.trim()}
                className="w-full bg-btn hover:bg-btn-hover px-4 py-2.5 rounded-full text-[14px] font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {busy && <Loader2 size={14} className="animate-spin" />} Create signing link
              </button>
              <p className="text-[12px] text-muted mt-3">Date signed fills in automatically. The signer agrees to sign electronically, and a certificate page with the signing details is added to the signed copy.</p>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
