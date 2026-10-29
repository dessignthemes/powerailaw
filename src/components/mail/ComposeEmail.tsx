"use client";

import { useEffect, useState } from "react";
import { X, Send, Info, ExternalLink, Loader2, CheckCircle2 } from "lucide-react";
import { subjectWithTag, composeLinks } from "@/lib/mail/matterTag";
import { signatureText } from "@/lib/mail/signatureHtml";
import SignaturePreview from "@/components/mail/SignaturePreview";

type Provider = "google" | "microsoft";

// Mail-to and web compose links carry the text in the address, which browsers
// and mail apps cut off past a few thousand characters.
const MAX_LINK_BODY = 5000;

// Write a new email or forward one. Sent straight from LawPower through the
// person's own Outlook / Gmail (free, from their address, in their Sent folder)
// when they've allowed "Send email"; otherwise it opens in Outlook / Gmail.
export default function ComposeEmail({
  title = "New email",
  initialTo = "",
  initialSubject = "",
  initialBody = "",
  matterNumber,
  providers,
  forwardOriginal,
  forwardMessage,
  replyMessage,
  footnote,
  onClose,
  onOpened,
  onSent,
}: {
  title?: string;
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
  matterNumber?: string | null; // added to the subject, so replies are filed to the matter
  providers: Provider[]; // connected mailboxes (empty: offer both)
  forwardOriginal?: { provider: Provider; url: string } | null; // open the original to forward it with attachments
  forwardMessage?: { provider: Provider; id: string } | null; // forward it from LawPower (attachments included)
  replyMessage?: { provider: Provider; id: string } | null; // reply in the same conversation (the mailbox quotes the original)
  footnote?: string;
  onClose: () => void;
  onOpened?: () => void;
  onSent?: () => void;
}) {
  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  // Mailboxes that can send from LawPower.
  const [senders, setSenders] = useState<{ provider: Provider; email: string | null }[] | null>(null);
  const [from, setFrom] = useState<Provider | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/mail/status")
      .then((r) => (r.ok ? r.json() : { connections: [] }))
      .then((d: { connections?: { provider: Provider; email: string | null; canSend?: boolean }[] }) => {
        if (!live) return;
        const list = (d.connections ?? []).filter((c) => c.canSend).map((c) => ({ provider: c.provider, email: c.email }));
        setSenders(list);
        const wanted = replyMessage?.provider ?? forwardMessage?.provider;
        setFrom(list.find((c) => c.provider === wanted)?.provider ?? list[0]?.provider ?? null);
      })
      .catch(() => live && setSenders([]));
    return () => {
      live = false;
    };
  }, [forwardMessage?.provider, replyMessage?.provider]);
  // The person's signature (Settings → Mail automation), ticked by default when it's switched on.
  const [signature, setSignature] = useState<string>("");
  const [withSig, setWithSig] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/me/signature")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { on?: boolean; html?: string } | null) => {
        if (!live || !d?.html?.trim()) return;
        setSignature(d.html);
        setWithSig(d.on !== false);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const canSendHere = !!senders?.length;
  const nativeForward = !!forwardMessage && from === forwardMessage.provider;
  const nativeReply = !!replyMessage && from === replyMessage.provider;

  async function send() {
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: from, to, cc, subject: finalSubject, body, signature: withSig && !!signature, forwardMessageId: nativeForward ? forwardMessage!.id : undefined, replyMessageId: nativeReply ? replyMessage!.id : undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? "The email couldn't be sent. Please try again.");
      setSent(d.from ?? "your mailbox");
      onSent?.();
      setTimeout(() => onOpened?.(), 1400);
    } catch (e) {
      setSendError((e as Error).message);
    } finally {
      setSending(false);
    }
  }
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const finalSubject = matterNumber ? subjectWithTag(subject, matterNumber) : subject.trim();
  // Opening in Outlook / Gmail instead: the signature goes along as plain text,
  // under the message and above any forwarded email.
  const linkBody = withSig && signature ? (() => {
    const i = body.search(/\n*-{6,} Forwarded message -{6,}/);
    const note = (i < 0 ? body : body.slice(0, i)).trimEnd();
    return `${note}\n\n${signatureText(signature)}${i < 0 ? "" : body.slice(i)}`;
  })() : body;
  const trimmed = linkBody.length > MAX_LINK_BODY ? `${linkBody.slice(0, MAX_LINK_BODY)}\n\n[… shortened]` : linkBody;
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
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com (several: separate with commas)" className="bg-white border border-line rounded-xl px-3 py-2.5 text-[14px] outline-none" />
            {!showCc && canSendHere && (
              <button type="button" onClick={() => setShowCc(true)} className="self-start text-[12px] text-muted underline underline-offset-2 hover:text-ink">
                Add Cc
              </button>
            )}
          </label>
          {showCc && (
            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] font-semibold text-muted">Cc</span>
              <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="name@example.com" className="bg-white border border-line rounded-xl px-3 py-2.5 text-[14px] outline-none" />
            </label>
          )}
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
            {linkBody.length > MAX_LINK_BODY && !canSendHere && (
              <span className="text-[12px] text-[#8A4B14]">Long message: only the first part is carried over. Paste the rest in your mail app if needed.</span>
            )}
          </label>
          {signature && (
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-[12.5px] font-semibold text-muted cursor-pointer w-fit">
                <input type="checkbox" checked={withSig} onChange={(e) => setWithSig(e.target.checked)} className="w-3.5 h-3.5 accent-[#5E6E8C]" />
                Add my signature
              </label>
              {withSig && (
                <div className="bg-white border border-line rounded-xl px-3 py-2.5 max-h-[220px] overflow-y-auto">
                  <SignaturePreview html={signature} />
                </div>
              )}
            </div>
          )}
          {nativeForward && (
            <div className="flex gap-2 text-[12.5px] bg-[#E7F6EE] text-[#155C3A] rounded-xl px-3 py-2">
              <Info size={14} className="flex-shrink-0 mt-0.5" />
              <span>The original email and its attachments go along with your message.</span>
            </div>
          )}
          {forwardOriginal && !nativeForward && (
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
          {sent ? (
            <div className="flex items-center gap-2 rounded-xl bg-[#E7F6EE] text-[#155C3A] px-4 py-3 text-[13.5px]">
              <CheckCircle2 size={16} /> Sent from {sent}. It&apos;s in your Sent folder.
            </div>
          ) : canSendHere ? (
            <>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {senders!.length > 1 && (
                  <select value={from ?? ""} onChange={(e) => setFrom(e.target.value as Provider)} aria-label="Send from" className="bg-white border border-line rounded-full px-3 py-2 text-[13px] outline-none">
                    {senders!.map((c) => (
                      <option key={c.provider} value={c.provider}>
                        From {c.email ?? label(c.provider)}
                      </option>
                    ))}
                  </select>
                )}
                <button onClick={() => void send()} disabled={sending || !to.trim() || !finalSubject} className="flex items-center gap-1.5 bg-btn hover:bg-btn-hover disabled:opacity-50 px-5 py-2 rounded-full text-[13.5px] font-semibold">
                  {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} {sending ? "Sending…" : "Send"}
                </button>
                <span className="text-[12px] text-muted">or</span>
                {list.map((p) => (
                  <button key={p} onClick={() => go(links[p], true)} className="text-[12.5px] underline underline-offset-2 text-muted hover:text-ink">
                    write it in {label(p)}
                  </button>
                ))}
              </div>
              {sendError && <div className="rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-2.5 text-[13px]">{sendError}</div>}
              <div className="text-[12px] text-muted">
                Sends from {senders!.find((c) => c.provider === from)?.email ?? "your mailbox"} through {label(from ?? "microsoft")}, free. It appears in your Sent folder.{footnote && footnote.includes("matter") ? " Once sent, it's saved to this matter." : ""}
              </div>
            </>
          ) : (
            <>
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
              {senders && (
                <div className="flex gap-2 text-[12.5px] bg-[#EEF3FB] rounded-xl px-3 py-2">
                  <Info size={14} className="flex-shrink-0 mt-0.5 text-muted" />
                  <span>
                    Want to send straight from LawPower, free, from your own address?{" "}
                    <a href={`/connect?provider=${list.includes("microsoft") ? "microsoft" : "google"}&next=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/dashboard/inbox")}`} className="font-medium underline underline-offset-2">
                      Reconnect {list.includes("microsoft") ? "Outlook" : "Gmail"} once
                    </a>{" "}
                    and keep <b>Send email</b> ticked.
                  </span>
                </div>
              )}
            </>
          )}
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
