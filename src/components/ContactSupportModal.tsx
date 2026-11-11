"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Paperclip, Loader2, Check, LifeBuoy } from "lucide-react";
import { SUPPORT_EMAIL } from "@/components/LegalPage";

const topics = [
  "The AI didn't help / gave a wrong answer",
  "Something looks broken / a bug",
  "Billing question",
  "Feature request",
  "Other",
];

const field =
  "w-full bg-white border border-[#E7E2D7] rounded-xl px-3.5 py-2.5 text-[14px] outline-none focus:border-[#C0B599] transition-colors placeholder:text-muted";
const MAX_FILES = 5;
const MAX_FILE = 5 * 1024 * 1024;

// The Contact support form. Emails support@lawpower.ai. Used in the pop-up (left menu) and
// inline in Settings → Support.
export function ContactSupportForm({ email, onClose, inline = false }: { email: string; onClose?: () => void; inline?: boolean }) {
  const [name, setName] = useState("");
  const [replyTo, setReplyTo] = useState(email);
  const [topic, setTopic] = useState(topics[0]);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const canSend = name.trim().length > 0 && description.trim().length > 0 && !busy;

  function handleAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    const tooBig = picked.find((f) => f.size > MAX_FILE);
    if (tooBig) setError(`“${tooBig.name}” is over 5 MB.`);
    else setError(null);
    setFiles((prev) => [...prev, ...picked.filter((f) => f.size <= MAX_FILE)].slice(0, MAX_FILES));
  }

  async function handleSend() {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("replyTo", replyTo);
    fd.set("topic", topic);
    fd.set("description", description);
    fd.set("page", typeof window !== "undefined" ? window.location.pathname : "");
    files.forEach((f) => fd.append("files", f));
    const res = await fetch("/api/support", { method: "POST", body: fd }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(d?.error ?? `It couldn't be sent. Please email ${SUPPORT_EMAIL} directly.`);
      return;
    }
    setSent(true);
    if (!inline && onClose) setTimeout(onClose, 2200);
  }

  if (sent)
    return (
      <div className={`flex flex-col items-center justify-center text-center ${inline ? "py-10 rounded-2xl bg-[#F7F6F2] border border-[#EEEBE4]" : "py-14"}`}>
        <span className="w-11 h-11 rounded-full bg-[#E8F6EE] text-[#1F7A4D] flex items-center justify-center mb-3">
          <Check size={20} />
        </span>
        <div className="text-[18px] font-semibold mb-1.5">Sent to support</div>
        <p className="text-[14px] text-muted">We&apos;ll reply to {replyTo || "you"} shortly.</p>
        {inline && (
          <button
            onClick={() => {
              setSent(false);
              setDescription("");
              setFiles([]);
            }}
            className="mt-4 bg-chip hover:bg-btn border border-btn px-4 py-2 rounded-full text-[13px] font-medium transition-colors"
          >
            Send another message
          </button>
        )}
      </div>
    );

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <label className="block">
          <div className="text-[13px] font-medium mb-1.5">Your name</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={field} />
        </label>
        <label className="block">
          <div className="text-[13px] font-medium mb-1.5">Reply-to email</div>
          <input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="you@firm.com" className={field} />
        </label>
      </div>

      <label className="block mb-5">
        <div className="text-[13px] font-medium mb-1.5">What&apos;s this about?</div>
        <select value={topic} onChange={(e) => setTopic(e.target.value)} className={`${field} appearance-none cursor-pointer`}>
          {topics.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>

      <label className="block mb-5">
        <div className="text-[13px] font-medium mb-1.5">Describe the problem</div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="What happened? Steps to reproduce, what you expected…"
          className={`${field} py-3 resize-none`}
        />
      </label>

      <div className="mb-6">
        <label
          className={`inline-flex items-center gap-1.5 bg-chip hover:bg-btn border border-btn px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors ${
            files.length >= MAX_FILES ? "opacity-50 pointer-events-none" : "cursor-pointer"
          }`}
        >
          <Paperclip size={14} /> Attach screenshots ({files.length}/{MAX_FILES})
          <input type="file" accept="image/*,application/pdf" multiple onChange={handleAttach} className="hidden" />
        </label>
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {files.map((f, i) => (
              <span key={i} className="flex items-center gap-1 bg-[#F7F6F2] border border-[#EEEBE4] pl-2.5 pr-1 py-0.5 rounded-full text-[12px] text-muted">
                <span className="max-w-[180px] truncate">{f.name}</span>
                <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="w-5 h-5 rounded-full hover:bg-white flex items-center justify-center hover:text-ink">
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {error && <div className="mb-4 rounded-xl bg-[#FDECEC] border border-[#F6C9C9] text-[#9F1D1D] px-3.5 py-2.5 text-[13px]">{error}</div>}

      <div className={`flex items-center gap-3 ${inline ? "" : ""}`}>
        {!inline && onClose && (
          <button onClick={onClose} className="flex-1 bg-chip hover:bg-btn border border-btn px-4 py-2.5 rounded-full text-[14px] font-medium transition-colors">
            Cancel
          </button>
        )}
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={`${inline ? "" : "flex-1"} bg-btn hover:bg-btn-hover border border-btn px-5 py-2.5 rounded-full text-[14px] font-semibold transition-colors disabled:opacity-50 disabled:hover:bg-btn flex items-center justify-center gap-2`}
        >
          {busy && <Loader2 size={14} className="animate-spin" />} {busy ? "Sending…" : "Send to support"}
        </button>
      </div>
    </>
  );
}

// Contact support pop-up (from the left menu).
export default function ContactSupportModal({ email, onClose }: { email: string; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl w-full max-w-[620px] max-h-[90vh] overflow-y-auto p-7">
        <div className="flex items-start justify-between mb-1.5">
          <h2 className="text-[22px] font-semibold flex items-center gap-2">
            <LifeBuoy size={20} strokeWidth={1.75} /> Contact support
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <p className="text-[13.5px] text-muted mb-6 max-w-[500px]">
          Tell us what you were doing, what you expected, and what actually happened. Adding screenshots helps us resolve it faster. It goes to{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-2 hover:text-ink">{SUPPORT_EMAIL}</a>.
        </p>
        <ContactSupportForm email={email} onClose={onClose} />
      </div>
    </div>,
    document.body,
  );
}
