"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Image as ImageIcon, Loader2, MessagesSquare, Paperclip } from "lucide-react";
import type { MailMessage, MailProvider, MailSummary } from "@/lib/mail/types";
import { emailDocument } from "@/lib/mail/emailDocument";

// An email's content at its full height, so several emails can sit one under
// another in a conversation. Still sandboxed: no scripts can run inside, links
// open in a new tab; the same origin is only allowed so the height can be read.
export function AutoHeightFrame({ srcDoc, title, minHeight = 120 }: { srcDoc: string; title: string; minHeight?: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(minHeight);
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let ro: ResizeObserver | null = null;
    const measure = () => {
      const doc = frame.contentDocument;
      if (!doc?.body) return;
      setH(Math.max(minHeight, doc.documentElement.scrollHeight, doc.body.scrollHeight));
    };
    const onLoad = () => {
      measure();
      const body = frame.contentDocument?.body;
      if (body && typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(measure);
        ro.observe(body);
      }
      // Images arriving late change the height.
      frame.contentDocument?.querySelectorAll("img").forEach((img) => img.addEventListener("load", measure));
    };
    frame.addEventListener("load", onLoad);
    return () => {
      frame.removeEventListener("load", onLoad);
      ro?.disconnect();
    };
  }, [srcDoc, minHeight]);
  return (
    <iframe
      ref={ref}
      title={title}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={srcDoc}
      style={{ height: h }}
      className="w-full bg-white block"
    />
  );
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

// One earlier email in the conversation: a compact row that opens in place.
function ThreadItem({ provider, s, you, onOpen }: { provider: MailProvider; s: MailSummary; you: boolean; onOpen: (s: MailSummary) => void }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<MailMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState(false);
  useEffect(() => {
    if (!open || msg) return;
    let live = true;
    fetch(`/api/mail/messages/${encodeURIComponent(s.id)}?provider=${provider}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error ?? "This email couldn't be opened.");
        return d.message as MailMessage;
      })
      .then((m) => live && setMsg(m))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [open, msg, provider, s.id]);

  return (
    <div className="border border-line rounded-xl bg-white overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full text-left flex items-start gap-2.5 px-4 py-3 hover:bg-chip/50 transition-colors" aria-expanded={open}>
        {open ? <ChevronDown size={14} className="mt-0.5 text-muted flex-shrink-0" /> : <ChevronRight size={14} className="mt-0.5 text-muted flex-shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-[13.5px] truncate ${s.unread ? "font-semibold" : "font-medium"}`}>{you ? `You (${s.from})` : s.from}</span>
            {s.hasAttachments && <Paperclip size={12} className="text-muted flex-shrink-0" />}
            <span className="ml-auto text-[12px] text-muted flex-shrink-0">{fmt(s.date)}</span>
          </div>
          {!open && <div className="text-[12.5px] text-muted truncate">{s.snippet}</div>}
        </div>
      </button>
      {open && (
        <div className="border-t border-line">
          {error ? (
            <div className="px-4 py-3 text-[13px] text-red-700">{error}</div>
          ) : !msg ? (
            <div className="px-4 py-4 text-[13px] text-muted flex items-center gap-2">
              <Loader2 size={13} className="animate-spin" /> Opening…
            </div>
          ) : (
            <>
              <div className="px-4 pt-2.5 pb-2 text-[12.5px] text-muted flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {msg.to && <span className="truncate max-w-full">To: {msg.to}</span>}
                {msg.cc && <span className="truncate max-w-full">Cc: {msg.cc}</span>}
                {msg.attachments.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Paperclip size={11} /> {msg.attachments.map((a) => a.name).join(", ")}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1.5">
                  {msg.html && !images && (
                    <button onClick={() => setImages(true)} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-chip hover:bg-btn text-ink">
                      <ImageIcon size={11} /> Show images
                    </button>
                  )}
                  <button onClick={() => onOpen(s)} className="px-2.5 py-0.5 rounded-full bg-chip hover:bg-btn text-ink font-medium" title="Open this email with all its actions (forward, file to matter…)">
                    Open
                  </button>
                </span>
              </div>
              <AutoHeightFrame srcDoc={emailDocument(msg, images)} title={`Email from ${s.from}`} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// The rest of the conversation under the open email: every other email in the
// thread (yours from Sent Items too), newest first, each opening in place.
export function ThreadView({
  provider,
  threadId,
  currentId,
  onOpen,
  onCount,
}: {
  provider: MailProvider;
  threadId: string;
  currentId: string;
  onOpen: (s: MailSummary) => void;
  onCount?: (n: number) => void;
}) {
  const [data, setData] = useState<{ key: string; messages: MailSummary[]; mailbox: string } | null>(null);
  const key = `${provider}|${threadId}`;
  useEffect(() => {
    let live = true;
    fetch(`/api/mail/threads/${encodeURIComponent(threadId)}?provider=${provider}`)
      .then((r) => (r.ok ? r.json() : { messages: [], mailbox: "" }))
      .then((d: { messages: MailSummary[]; mailbox: string }) => {
        if (!live) return;
        setData({ key, messages: d.messages ?? [], mailbox: (d.mailbox ?? "").toLowerCase() });
        onCount?.(d.messages?.length ?? 0);
      })
      .catch(() => live && setData({ key, messages: [], mailbox: "" }));
    return () => {
      live = false;
    };
  }, [key, provider, threadId, onCount]);

  if (!data || data.key !== key) {
    return (
      <div className="px-6 py-4 text-[13px] text-muted flex items-center gap-2">
        <Loader2 size={13} className="animate-spin" /> Loading the conversation…
      </div>
    );
  }
  const others = data.messages.filter((m) => m.id !== currentId);
  if (!others.length) return null;
  return (
    <div className="px-6 py-5 border-t border-line bg-card-alt/60">
      <div className="flex items-center gap-2 text-[13px] font-semibold mb-3">
        <MessagesSquare size={14} className="text-muted" /> Rest of this conversation · {others.length} more {others.length === 1 ? "email" : "emails"}
      </div>
      <div className="flex flex-col gap-2">
        {others.map((m) => (
          <ThreadItem key={m.id} provider={provider} s={m} you={!!data.mailbox && m.fromEmail.toLowerCase() === data.mailbox} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
