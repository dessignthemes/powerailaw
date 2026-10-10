"use client";

import { useState } from "react";
import { X, Copy, Check, Mail, KeyRound, Loader2, Send, Inbox } from "lucide-react";
import DropZone from "./DropZone";
import { useUploads, api } from "./useUploads";
import { SHARE_DAYS, type ShareKind } from "@/lib/shares/types";

const input = "w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-[13.5px] outline-none focus:border-btn-ring";

function randomPassword() {
  const a = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const b = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(b, (x) => a[x % a.length]).join("");
}

export function linkFor(token: string) {
  return `${window.location.origin}/share/${token}`;
}

export function mailtoFor(kind: ShareKind, to: string, title: string, link: string, expiresAt: string, hasPassword: boolean) {
  const date = new Date(expiresAt).toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const body =
    (kind === "send"
      ? `Hello,\n\nI'm sending you files securely. You can download them here:\n${link}\n\n`
      : `Hello,\n\nPlease upload your documents securely using this link:\n${link}\n\n`) +
    (hasPassword ? "I'll send you the password separately.\n\n" : "") +
    `The link works until ${date}, after which the files are deleted.\n`;
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

export default function CreateShareModal({ kind, onClose, onCreated }: { kind: ShareKind; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [usePw, setUsePw] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ link: string; expiresAt: string; failed: number } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const up = useUploads();
  const send = kind === "send";

  async function submit() {
    setError(null);
    if (send && up.items.length === 0) return setError("Add at least one file to send.");
    if (usePw && password.length < 6) return setError("Use a password of at least 6 characters.");
    setBusy(true);
    try {
      const { share, token } = await api("/api/shares", { kind, title, message, recipientEmail: email, password: usePw ? password : "" });
      let failed = 0;
      if (send) {
        const ok = await up.run(
          (f) => api(`/api/shares/${share.id}`, { action: "upload", name: f.name, size: f.size, type: f.type }),
          (fileId) => api(`/api/shares/${share.id}`, { action: "complete", fileId })
        );
        failed = up.items.length - ok;
      }
      setResult({ link: linkFor(token), expiresAt: share.expiresAt, failed });
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const copy = async (what: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={busy ? undefined : onClose}>
      <div className="bg-page rounded-3xl w-full max-w-[600px] max-h-[92vh] overflow-y-auto p-7 shadow-[0_20px_60px_rgba(27,25,26,0.18)]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={send ? "Send files" : "Request files"}>
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-chip flex items-center justify-center">{send ? <Send size={16} strokeWidth={1.75} /> : <Inbox size={16} strokeWidth={1.75} />}</span>
            <h2 className="text-[20px] font-semibold">{send ? "Send files securely" : "Request files securely"}</h2>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <p className="text-[13px] text-muted mb-5">
          {send
            ? "Upload files and get a private link to give the recipient."
            : "Get a private link where a client (or anyone) can upload documents for you."}{" "}
          The link and all files are deleted automatically after {SHARE_DAYS} days.
        </p>

        {result ? (
          <div>
            <div className="bg-[#E6F6EC] rounded-2xl px-4 py-3 text-[13.5px] mb-4">
              <b>Your link is ready.</b> Copy it now. For safety, LawPower can’t show this exact link again (you can make a new one any time).
              {result.failed > 0 && <div className="mt-1 text-[#B42318]">{result.failed} file(s) didn’t upload. You can add them from the link’s details.</div>}
            </div>
            <div className="flex items-center gap-2 mb-3">
              <input readOnly value={result.link} className={`${input} font-mono text-[12.5px]`} onFocus={(e) => e.target.select()} />
              <button onClick={() => copy("link", result.link)} className="flex-shrink-0 flex items-center gap-1.5 bg-btn hover:bg-btn-hover px-3.5 py-2.5 rounded-full text-[13px] font-medium transition-colors">
                {copied === "link" ? <Check size={14} /> : <Copy size={14} />} {copied === "link" ? "Copied" : "Copy"}
              </button>
            </div>
            {usePw && (
              <div className="flex items-center gap-2 mb-3 text-[13px]">
                <KeyRound size={14} className="text-muted" /> Password: <span className="font-mono bg-card-alt rounded px-2 py-0.5">{password}</span>
                <button onClick={() => copy("pw", password)} className="text-muted hover:text-ink">{copied === "pw" ? "Copied" : "Copy"}</button>
                <span className="text-muted">— send it separately (by text or phone), not in the same email.</span>
              </div>
            )}
            <div className="flex items-center gap-2 mt-5">
              <a href={mailtoFor(kind, email, title || (send ? "Files for you" : "Please upload your documents"), result.link, result.expiresAt, usePw)} className="flex items-center gap-1.5 bg-chip hover:bg-btn px-4 py-2 rounded-full text-[13.5px] font-medium transition-colors">
                <Mail size={14} strokeWidth={1.75} /> Email the link
              </a>
              <button onClick={onClose} className="ml-auto bg-btn hover:bg-btn-hover px-4 py-2 rounded-full text-[13.5px] font-medium transition-colors">Done</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            <label className="grid gap-1">
              <span className="text-[13px] text-muted">Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={send ? "e.g. Closing documents – Smith purchase" : "e.g. Documents for your home purchase"} className={input} />
            </label>
            <label className="grid gap-1">
              <span className="text-[13px] text-muted">Recipient email (optional, for the email button)</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@example.com" className={input} />
            </label>
            <label className="grid gap-1">
              <span className="text-[13px] text-muted">{send ? "Message (optional)" : "What should they upload? (optional)"}</span>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={2000} placeholder={send ? "Shown above the files" : "e.g. Copy of your driver’s license, the signed contract and your mortgage commitment letter."} className={`${input} resize-y`} />
            </label>
            <div className="bg-card-alt rounded-xl px-3.5 py-3">
              <label className="flex items-center gap-2 text-[13.5px] font-medium cursor-pointer">
                <input type="checkbox" checked={usePw} onChange={(e) => {
                  setUsePw(e.target.checked);
                  if (e.target.checked && !password) setPassword(randomPassword());
                }} className="w-4 h-4 accent-[#1B191A]" />
                Require a password
              </label>
              {usePw && (
                <div className="mt-2 flex items-center gap-2">
                  <input value={password} onChange={(e) => setPassword(e.target.value)} className={`${input} font-mono`} />
                  <button type="button" onClick={() => setPassword(randomPassword())} className="flex-shrink-0 bg-chip hover:bg-btn px-3 py-2 rounded-full text-[12.5px] font-medium transition-colors">New</button>
                </div>
              )}
              <div className="text-[12px] text-muted mt-1.5">Recommended for sensitive documents. Give the password separately, by text or phone.</div>
            </div>
            {send && <DropZone items={up.items} onAdd={up.add} onRemove={busy ? undefined : up.remove} disabled={busy} />}
            {error && <div className="text-[13px] text-[#B42318]">{error}</div>}
            <div className="flex items-center justify-end gap-2 mt-1">
              <button onClick={onClose} disabled={busy} className="bg-chip hover:bg-btn px-4 py-2 rounded-full text-[13.5px] font-medium transition-colors">Cancel</button>
              <button onClick={submit} disabled={busy} className="bg-btn hover:bg-btn-hover px-4 py-2 rounded-full text-[13.5px] font-medium transition-colors disabled:opacity-60 flex items-center gap-1.5">
                {busy && <Loader2 size={14} className="animate-spin" />}
                {busy ? (send ? "Uploading…" : "Creating…") : send ? "Upload & create link" : "Create upload link"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
