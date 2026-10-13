"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageSquare, FileText, Download, Send, ShieldCheck } from "lucide-react";

type Attachment = { id: string; title: string; versionId: string | null; fileType: string };
type Msg = { id: string; matterId: string | null; direction: "firm" | "client"; body: string; senderName: string; createdAt: string; attachments: Attachment[] };
type Matter = { id: string; title: string };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

// Secure messages from the law firm, one conversation per matter, with a reply box.
export default function PortalMessages({ firm, matters }: { firm: string; matters: Matter[] }) {
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/portal/messages")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!live) return;
        if (!r.ok) {
          // Messages not set up yet: the rest of the portal still works.
          if (r.status === 503) return setMessages([]);
          return setError(d?.error ?? "Couldn't load your messages.");
        }
        setMessages(d.messages ?? []);
        setNewCount(d.newCount ?? 0);
      })
      .catch(() => live && setError("Couldn't load your messages. Check your connection."));
    return () => {
      live = false;
    };
  }, []);

  if (error) return <div className="mb-8 rounded-xl bg-[#FDF1E7] text-[#8A4B14] px-4 py-3 text-[13.5px]">{error}</div>;
  if (messages === null)
    return (
      <div className="mb-8 flex items-center gap-2 text-muted text-[13.5px]">
        <Loader2 size={14} className="animate-spin" /> Loading your messages…
      </div>
    );
  if (!messages.length) return null;

  const groups = [...matters, { id: "", title: "General" }]
    .map((m) => ({ m, list: messages.filter((x) => (m.id ? x.matterId === m.id : !matters.some((y) => y.id === x.matterId))) }))
    .filter((g) => g.list.length);

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare size={16} className="text-muted" />
        <h2 className="text-[17px] font-semibold" style={{ letterSpacing: 0 }}>
          Messages
        </h2>
        {newCount > 0 && <span className="bg-[#3B82F6] text-white text-[11.5px] font-semibold rounded-full px-2 py-0.5">{newCount} new</span>}
      </div>
      <div className="flex flex-col gap-5">
        {groups.map(({ m, list }) => (
          <Conversation key={m.id || "general"} matter={m} firm={firm} initial={list} />
        ))}
      </div>
    </section>
  );
}

function Conversation({ matter, firm, initial }: { matter: Matter; firm: string; initial: Msg[] }) {
  const [list, setList] = useState(initial);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/portal/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matterId: matter.id || null, body: reply }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? "Your message couldn't be sent. Please try again.");
      setList((l) => [...l, d.message]);
      setReply("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-card-alt rounded-2xl p-4">
      <div className="text-[14px] font-semibold mb-3">{matter.title}</div>
      <div className="flex flex-col gap-2.5">
        {list.map((x) => {
          const fromFirm = x.direction === "firm";
          return (
            <div key={x.id} className={`flex ${fromFirm ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${fromFirm ? "bg-white" : "bg-[#E1E7F4]"}`}>
                <div className="text-[11.5px] text-muted mb-0.5">
                  {fromFirm ? `${x.senderName}, ${firm}` : "You"} · {when(x.createdAt)}
                </div>
                {x.body && <div className="text-[14px] whitespace-pre-wrap">{x.body}</div>}
                {x.attachments.length > 0 && (
                  <div className="flex flex-col gap-1.5 mt-2">
                    {x.attachments.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 bg-card-alt rounded-xl px-3 py-2">
                        <FileText size={15} className="text-muted flex-shrink-0" />
                        <span className="text-[13px] font-medium truncate flex-1">{a.title}</span>
                        {a.versionId && (
                          <>
                            <a href={`/api/portal/file/${a.versionId}`} target="_blank" rel="noopener" className="text-[12.5px] font-medium bg-chip hover:bg-btn rounded-full px-2.5 py-1">
                              Open
                            </a>
                            <a href={`/api/portal/file/${a.versionId}?download=1`} aria-label={`Download ${a.title}`} className="bg-btn hover:bg-btn-hover rounded-full p-1.5">
                              <Download size={13} />
                            </a>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={3}
          placeholder={`Reply securely to ${firm}…`}
          className="bg-white border border-line rounded-xl px-3 py-2.5 text-[14px] outline-none resize-y"
        />
        {error && <div className="text-[13px] text-[#B42318]">{error}</div>}
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted flex items-center gap-1">
            <ShieldCheck size={12} /> Only you and {firm} can read this.
          </span>
          <button onClick={() => void send()} disabled={busy || !reply.trim()} className="ml-auto flex items-center gap-1.5 bg-btn hover:bg-btn-hover disabled:opacity-50 px-4 py-2 rounded-full text-[13.5px] font-medium">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send reply
          </button>
        </div>
      </div>
    </div>
  );
}
