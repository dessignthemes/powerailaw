"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageSquare, FileText, Download, Send, ShieldCheck, Paperclip, X, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg";
const MAX_BYTES = 25 * 1024 * 1024;
const fmtSize = (n: number) => (n < 1024 ** 2 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`);

// Uploads one file straight to the firm's secure storage; returns its storage path.
async function uploadFile(matterId: string, file: File): Promise<{ path: string; ticket: string }> {
  const r = await fetch("/api/portal/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matterId, name: file.name, size: file.size }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error ?? `"${file.name}" couldn't be sent.`);
  const { error } = await createClient().storage.from("matter-documents").uploadToSignedUrl(d.path, d.token, file, { contentType: file.type || "application/octet-stream" });
  if (error) throw new Error(`"${file.name}" didn't finish uploading. Check your connection and try again.`);
  return { path: d.path as string, ticket: d.ticket as string };
}

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
  if (!messages.length && !matters.length) return null;

  // One conversation per matter (so files can be sent anytime), plus any general messages.
  const groups = [...matters, { id: "", title: "General" }]
    .map((m) => ({ m, list: messages.filter((x) => (m.id ? x.matterId === m.id : !matters.some((y) => y.id === x.matterId))) }))
    .filter((g) => g.m.id || g.list.length);

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
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const ok: File[] = [];
    const bad: string[] = [];
    for (const f of Array.from(list)) {
      const ext = f.name.toLowerCase().split(".").pop() ?? "";
      if (!ACCEPT.split(",").includes(`.${ext}`)) bad.push(`"${f.name}" isn't a supported file (use PDF, Word, Excel, text, JPG or PNG).`);
      else if (f.size > MAX_BYTES) bad.push(`"${f.name}" is larger than 25 MB.`);
      else if (f.size === 0) bad.push(`"${f.name}" is empty.`);
      else ok.push(f);
    }
    setFiles((cur) => [...cur, ...ok].slice(0, 10));
    setError(bad.length ? bad.join(" ") : null);
  }

  async function send() {
    if (!reply.trim() && !files.length) return;
    setBusy(true);
    setError(null);
    try {
      const uploads: { path: string; ticket: string; name: string }[] = [];
      for (const [i, f] of files.entries()) {
        setProgress(`Uploading ${i + 1} of ${files.length}: ${f.name}`);
        uploads.push({ ...(await uploadFile(matter.id, f)), name: f.name });
      }
      setProgress(files.length ? "Checking files…" : null);
      const r = await fetch("/api/portal/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matterId: matter.id || null, body: reply, uploads }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? "Your message couldn't be sent. Please try again.");
      setList((l) => [...l, d.message]);
      setReply("");
      setFiles([]);
      if (d.failed?.length) setError(`${d.failed.join(", ")} couldn't be read, so ${d.failed.length === 1 ? "it wasn't" : "they weren't"} sent. Please check the file and try again.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="bg-card-alt rounded-2xl p-4">
      <div className="text-[14px] font-semibold mb-3">{matter.title}</div>
      <div className="flex flex-col gap-2.5">
        {list.length === 0 && <div className="text-[13px] text-muted">No messages yet. You can send a message or files to {firm} here.</div>}
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
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span key={f.name + i} className="flex items-center gap-1.5 bg-white rounded-lg pl-2.5 pr-1 py-1 text-[12.5px]">
                <FileText size={12} className="text-muted" /> {f.name} <span className="text-muted">{fmtSize(f.size)}</span>
                {!busy && (
                  <button onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="w-5 h-5 rounded-full hover:bg-chip flex items-center justify-center">
                    <X size={11} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {progress && (
          <div className="text-[12.5px] text-muted flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" /> {progress}
          </div>
        )}
        {error && (
          <div className="text-[13px] text-[#B42318] flex gap-1.5">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {matter.id && (
            <label className={`flex items-center gap-1.5 bg-chip hover:bg-btn px-3.5 py-2 rounded-full text-[13px] font-medium cursor-pointer ${busy ? "opacity-50 pointer-events-none" : ""}`}>
              <Paperclip size={13} /> Attach files
              <input type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
            </label>
          )}
          <span className="text-[12px] text-muted flex items-center gap-1">
            <ShieldCheck size={12} /> Only you and {firm} can read this. PDF, Word, Excel, JPG or PNG, up to 25 MB.
          </span>
          <button
            onClick={() => void send()}
            disabled={busy || (!reply.trim() && !files.length)}
            className="ml-auto flex items-center gap-1.5 bg-btn hover:bg-btn-hover disabled:opacity-50 px-4 py-2 rounded-full text-[13.5px] font-medium"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send
          </button>
        </div>
      </div>
    </div>
  );
}
