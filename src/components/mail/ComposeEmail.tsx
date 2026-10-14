"use client";

import { useEffect, useState } from "react";
import { X, Send, Info, ExternalLink } from "lucide-react";
import { subjectWithTag, composeLinks } from "@/lib/mail/matterTag";

type Provider = "google" | "microsoft";

// Mail-to and web compose links carry the text in the address, which browsers
// and mail apps cut off past a few thousand characters.
const MAX_LINK_BODY = 5000;

// Write a new email or forward one. It opens in the person's own Gmail /
// Outlook (or mail app), ready to send; LawPower's mailbox access is read-only.
export default function ComposeEmail({
  title = "New email",
  initialTo = "",
  initialSubject = "",
  initialBody = "",
  matterNumber,
  providers,
  forwardOriginal,
  footnote,
  onClose,
  onOpened,
}: {
  title?: string;
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
  matterNumber?: string | null; // added to the subject, so replies are filed to the matter
  providers: Provider[]; // connected mailboxes (empty: offer both)
  forwardOriginal?: { provider: Provider; url: string } | null; // open the original to forward it with attachments
  footnote?: string;
  onClose: () => void;
  onOpened?: () => void;
}) {
  const [to, setTo] = useState(initialTo);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const finalSubject = matterNumber ? subjectWithTag(subject, matterNumber) : subject.trim();
  const trimmed = body.length > MAX_LINK_BODY ? `${body.slice(0, MAX_LINK_BODY)}\n\n[… shortened]` : body;
  const links = composeLinks(to, finalSubject, trimmed);
  const list: Provider[] = providers.length ? [...new Set(providers)] : ["google", "microsoft"];
  const label = (p: Provider) => (p === "google" ? "Gmail" : "Outlook");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const go = (href: string, newTab: boolean) => {
    if (newTab) window.open(href, "_blank", "noopener");
    else window.location.assign(href);
    onOpened?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title} className="bg-cream rounded-3xl w-full max-w-[640px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <div className="text-[15px] font-semibold">{title}</div>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="px-6 pb-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold text-muted">To</span>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" className="bg-white border border-line rounded-xl px-3 py-2.5 text-[14px] outline-none" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold text-muted">Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="bg-white border border-line rounded-xl px-3 py-2.5 text-[14px] outline-none" />
            {matterNumber && (
              <span className="text-[12px] text-muted">
                Sent as: <b className="text-ink">{finalSubject || `[${matterNumber}]`}</b>. Keep the matter number in the subject and every reply is filed to the matter automatically.
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold text-muted">Message</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9} className="bg-white border border-line rounded-xl px-3 py-2.5 text-[14px] outline-none resize-y" />
            {body.length > MAX_LINK_BODY && (
              <span className="text-[12px] text-[#8A4B14]">Long message: only the first part is carried over. Paste the rest in your mail app if needed.</span>
            )}
          </label>
          {forwardOriginal && (
            <div className="flex gap-2 text-[12.5px] bg-[#EEF3FB] rounded-xl px-3 py-2">
              <Info size={14} className="flex-shrink-0 mt-0.5 text-muted" />
              <span>
                Attachments aren&apos;t carried over here. To forward them too,{" "}
                <button onClick={() => go(forwardOriginal.url, true)} className="font-medium underline underline-offset-2 inline-flex items-center gap-1">
                  open the email in {label(forwardOriginal.provider)} <ExternalLink size={11} />
                </button>{" "}
                and click Forward there.
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {list.map((p) => (
              <button key={p} onClick={() => go(links[p], true)} className="flex items-center gap-1.5 bg-btn hover:bg-btn-hover px-4 py-2 rounded-full text-[13.5px] font-medium">
                <Send size={13} /> Write in {label(p)}
              </button>
            ))}
            <button onClick={() => go(links.app, false)} className="flex items-center gap-1.5 bg-chip hover:bg-btn px-4 py-2 rounded-full text-[13.5px] font-medium">
              Open in mail app
            </button>
          </div>
          <div className="text-[12px] text-muted">{footnote ?? "The email opens in your own mailbox, ready to send."}</div>
        </div>
      </div>
    </div>
  );
}

// "---------- Forwarded message ----------" block for a forward.
export function forwardBody(m: { from: string; fromEmail: string; to?: string; date: string; subject: string; text: string }) {
  const from = m.fromEmail && m.fromEmail !== m.from ? `${m.from} <${m.fromEmail}>` : m.from || m.fromEmail;
  const date = new Date(m.date).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  return `\n\n---------- Forwarded message ----------\nFrom: ${from}\nDate: ${date}\nSubject: ${m.subject}${m.to ? `\nTo: ${m.to}` : ""}\n\n${m.text.trim()}`;
}

export const fwdSubject = (s: string) => (/^(fwd?|fw):/i.test(s.trim()) ? s.trim() : `Fwd: ${s.trim()}`);
