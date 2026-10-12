"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mail, MessageSquare, ArrowDownLeft, ArrowUpRight, Loader2, RefreshCw, X, ExternalLink, Trash2, Paperclip, Send, Info } from "lucide-react";
import { subjectWithTag, composeLinks, smsLink } from "@/lib/mail/matterTag";
import type { Matter } from "@/components/NewMatterModal";
import type { Client } from "@/components/NewClientModal";

type Msg = {
  id: string;
  channel: "email" | "sms";
  direction: "in" | "out";
  source: "tagged" | "number" | "thread" | "logged";
  provider: "google" | "microsoft" | null;
  mailboxEmail: string | null;
  mine: boolean;
  subject: string;
  fromName: string;
  fromEmail: string;
  to: string;
  cc: string;
  phone: string | null;
  sentAt: string;
  snippet: string;
  bodyText: string | null;
  webLink: string | null;
  hasAttachments: boolean;
};
type Conn = { provider: "google" | "microsoft"; email: string | null; status: string };

const SOURCE: Record<Msg["source"], string> = {
  tagged: "Filed from Inbox",
  number: "Matter number in subject",
  thread: "Same email thread",
  logged: "Logged",
};

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d?.error ?? "Something went wrong. Please try again.");
  return d as T;
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

// The matter's Emails tab: every email and text on the matter, newest first.
export default function MatterEmails({ matter, client }: { matter: Matter; client: Client | null }) {
  const [list, setList] = useState<Msg[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [open, setOpen] = useState<Msg | null>(null);
  const [compose, setCompose] = useState<"email" | "sms" | null>(null);
  const [conns, setConns] = useState<Conn[]>([]);
  const awaitingReturn = useRef(false);
  const base = `/api/matters/${matter.id}/messages`;

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const d = await getJson<{ messages: Msg[]; sync: { added: number; checked: string[] } | null; syncError: string | null }>(`${base}?sync=1`);
      setList(d.messages);
      setError(null);
      setSyncNote(
        d.syncError ??
          (d.sync && d.sync.checked.length
            ? d.sync.added
              ? `${d.sync.added} new ${d.sync.added === 1 ? "email" : "emails"} found in ${d.sync.checked.join(", ")}.`
              : `Checked ${d.sync.checked.join(", ")}: nothing new.`
            : "Connect your mailbox in the Inbox to find this matter's emails automatically.")
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }, [base]);

  useEffect(() => {
    let live = true;
    // Saved messages first (fast), then the mailbox is checked for new ones.
    getJson<{ messages: Msg[] }>(base)
      .then((d) => live && setList(d.messages))
      .catch((e: Error) => live && (setError(e.message), setList([])))
      .finally(() => live && void sync());
    getJson<{ connections: Conn[] }>("/api/mail/status")
      .then((d) => live && setConns(d.connections ?? []))
      .catch(() => {});
    // Back from writing an email in Gmail/Outlook: look for it.
    const onFocus = () => {
      if (awaitingReturn.current) {
        awaitingReturn.current = false;
        setTimeout(() => void sync(), 4000);
      }
    };
    window.addEventListener("focus", onFocus);
    return () => {
      live = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [base, sync]);

  async function openMsg(m: Msg) {
    setOpen(m);
    if (m.channel === "email" && m.bodyText === null && m.mine) {
      try {
        const d = await getJson<{ message: Msg }>(`${base}/${m.id}`);
        setOpen(d.message);
        setList((l) => (l ?? []).map((x) => (x.id === m.id ? d.message : x)));
      } catch {
        /* keep the summary */
      }
    }
  }

  async function remove(m: Msg) {
    if (!confirm("Take this message off the matter? It stays in your mailbox.")) return;
    try {
      await getJson(`${base}/${m.id}`, { method: "DELETE" });
      setList((l) => (l ?? []).filter((x) => x.id !== m.id));
      setOpen(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[15px] font-semibold mr-auto">
          Emails &amp; texts{matter.matterNumber ? <span className="text-muted font-medium"> · {matter.matterNumber}</span> : null}
        </div>
        <button onClick={() => setCompose("email")} className="flex items-center gap-1.5 bg-btn hover:bg-btn-hover px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors">
          <Mail size={14} strokeWidth={1.75} /> New email
        </button>
        <button onClick={() => setCompose("sms")} className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors">
          <MessageSquare size={14} strokeWidth={1.75} /> Text message
        </button>
        <button
          onClick={() => void sync()}
          disabled={syncing}
          title="Look in your mailbox for emails with this matter number"
          className="flex items-center gap-1.5 bg-chip hover:bg-btn disabled:opacity-50 px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors"
        >
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} strokeWidth={1.75} />} Check mailbox
        </button>
      </div>

      {error && <div className="rounded-xl bg-[#FDF1E7] text-[#8A4B14] px-4 py-3 text-[13px]">{error}</div>}
      {syncNote && !error && <div className="text-[12.5px] text-muted">{syncNote}</div>}

      <div className="rounded-2xl overflow-hidden border border-line">
        {list === null ? (
          <div className="p-6 text-[13px] text-muted flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : list.length === 0 ? (
          <div className="p-8 flex flex-col items-center text-center gap-2">
            <Mail size={20} strokeWidth={1.5} className="text-muted" />
            <div className="text-[13.5px] font-medium">No emails or texts on this matter yet</div>
            <div className="text-[12.5px] text-muted max-w-[460px]">
              Use <b>New email</b> here (the matter number goes in the subject, so replies are filed automatically), or file any email to this matter from the Inbox.
            </div>
          </div>
        ) : (
          list.map((m, i) => {
            const Icon = m.channel === "sms" ? MessageSquare : Mail;
            const Dir = m.direction === "out" ? ArrowUpRight : ArrowDownLeft;
            const who = m.channel === "sms" ? m.phone ?? "Text" : m.direction === "out" ? `To: ${m.to || "—"}` : m.fromName || m.fromEmail;
            return (
              <button
                key={m.id}
                onClick={() => void openMsg(m)}
                className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-card-alt transition-colors ${i ? "border-t border-line" : ""}`}
              >
                <span className="relative mt-0.5 flex-shrink-0">
                  <Icon size={16} strokeWidth={1.75} className="text-muted" />
                  <Dir size={11} strokeWidth={2.25} className={`absolute -right-1.5 -bottom-1 ${m.direction === "out" ? "text-[#3B82F6]" : "text-green-600"}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[13.5px] font-medium truncate">{who}</span>
                    {m.hasAttachments && <Paperclip size={12} className="text-muted flex-shrink-0" />}
                    <span className="ml-auto text-[12px] text-muted flex-shrink-0">{when(m.sentAt)}</span>
                  </span>
                  {m.subject && <span className="block text-[13px] truncate">{m.subject}</span>}
                  <span className="block text-[12.5px] text-muted truncate">{m.snippet}</span>
                </span>
                <span className="hidden sm:inline text-[11px] text-muted bg-card-alt rounded-md px-1.5 py-0.5 flex-shrink-0 mt-0.5">{SOURCE[m.source]}</span>
              </button>
            );
          })
        )}
      </div>

      {open && <MessageView m={open} onClose={() => setOpen(null)} onRemove={() => void remove(open)} />}
      {compose === "email" && (
        <EmailComposer
          matter={matter}
          client={client}
          conns={conns}
          onClose={() => setCompose(null)}
          onOpened={() => {
            awaitingReturn.current = true;
            setCompose(null);
            setSyncNote("Once you send the email, it appears here automatically (click Check mailbox if it doesn't show up in a minute).");
          }}
        />
      )}
      {compose === "sms" && (
        <TextComposer
          matter={matter}
          client={client}
          onClose={() => setCompose(null)}
          onLogged={(messages) => {
            setList(messages);
            setCompose(null);
          }}
        />
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title} className="bg-cream rounded-3xl w-full max-w-[640px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <div className="text-[15px] font-semibold">{title}</div>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function MessageView({ m, onClose, onRemove }: { m: Msg; onClose: () => void; onRemove: () => void }) {
  return (
    <Modal title={m.channel === "sms" ? (m.direction === "out" ? "Text sent" : "Text received") : m.subject || "(no subject)"} onClose={onClose}>
      <div className="px-6 pb-5 flex flex-col gap-3">
        <div className="text-[12.5px] text-muted flex flex-col gap-0.5">
          {m.channel === "email" ? (
            <>
              <span>
                From: <span className="text-ink">{m.fromName}</span> {m.fromEmail && m.fromEmail !== m.fromName ? `<${m.fromEmail}>` : ""}
              </span>
              {m.to && <span>To: {m.to}</span>}
              {m.cc && <span>Cc: {m.cc}</span>}
            </>
          ) : (
            <span>{m.phone ?? ""}</span>
          )}
          <span>
            {when(m.sentAt)} · {SOURCE[m.source]}
          </span>
        </div>
        <div className="bg-white border border-line rounded-xl px-4 py-3 text-[13.5px] whitespace-pre-wrap max-h-[50vh] overflow-y-auto">
          {m.bodyText ?? (
            <span className="text-muted">
              {m.mine ? "Loading the full email…" : `Saved from ${m.mailboxEmail ?? "a colleague's mailbox"}. ${m.snippet}`}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {m.webLink && m.mine && (
            <a href={m.webLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3 py-1.5 rounded-full text-[12.5px] font-medium">
              <ExternalLink size={12} /> Open in {m.provider === "google" ? "Gmail" : "Outlook"}
            </a>
          )}
          <button onClick={onRemove} className="ml-auto flex items-center gap-1.5 text-[12.5px] text-muted hover:text-[#B42318]">
            <Trash2 size={13} /> Take off this matter
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EmailComposer({ matter, client, conns, onClose, onOpened }: { matter: Matter; client: Client | null; conns: Conn[]; onClose: () => void; onOpened: () => void }) {
  const [to, setTo] = useState(client?.email ?? "");
  const [subject, setSubject] = useState(matter.title);
  const [body, setBody] = useState("");
  const finalSubject = subjectWithTag(subject, matter.matterNumber);
  const links = composeLinks(to, finalSubject, body);
  const providers = [...new Set(conns.map((c) => c.provider))];
  const go = (href: string, newTab: boolean) => {
    if (newTab) window.open(href, "_blank", "noopener");
    else window.location.assign(href);
    onOpened();
  };
  return (
    <Modal title="New email" onClose={onClose}>
      <div className="px-6 pb-5 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[12.5px] font-semibold text-muted">To</span>
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" className="bg-white border border-line rounded-xl px-3 py-2.5 text-[14px] outline-none" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12.5px] font-semibold text-muted">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="bg-white border border-line rounded-xl px-3 py-2.5 text-[14px] outline-none" />
          {matter.matterNumber && (
            <span className="text-[12px] text-muted">
              Sent as: <b className="text-ink">{finalSubject}</b>. Keep the matter number in the subject and every reply is filed here automatically.
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12.5px] font-semibold text-muted">Message</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="bg-white border border-line rounded-xl px-3 py-2.5 text-[14px] outline-none resize-y" />
        </label>
        {!matter.matterNumber && (
          <div className="flex gap-2 text-[12.5px] text-[#8A4B14] bg-[#FDF1E7] rounded-xl px-3 py-2">
            <Info size={14} className="flex-shrink-0 mt-0.5" /> This matter has no number yet, so replies can&apos;t be filed automatically. Give it an abbreviation (pencil icon) first.
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {(providers.length ? providers : (["google", "microsoft"] as const)).map((p) => (
            <button
              key={p}
              onClick={() => go(links[p], true)}
              className="flex items-center gap-1.5 bg-btn hover:bg-btn-hover px-4 py-2 rounded-full text-[13.5px] font-medium"
            >
              <Send size={13} /> Write in {p === "google" ? "Gmail" : "Outlook"}
            </button>
          ))}
          <button onClick={() => go(links.app, false)} className="flex items-center gap-1.5 bg-chip hover:bg-btn px-4 py-2 rounded-full text-[13.5px] font-medium">
            Open in mail app
          </button>
        </div>
        <div className="text-[12px] text-muted">The email opens in your own mailbox, ready to send. Once sent, it&apos;s saved to this matter.</div>
      </div>
    </Modal>
  );
}

function TextComposer({ matter, client, onClose, onLogged }: { matter: Matter; client: Client | null; onClose: () => void; onLogged: (m: Msg[]) => void }) {
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function log(openApp: boolean) {
    if (!body.trim()) return setError("Type the message first.");
    setBusy(true);
    setError(null);
    try {
      const d = await getJson<{ messages: Msg[] }>(`/api/matters/${matter.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "sms", direction, phone, body }),
      });
      if (openApp && phone.trim()) window.location.assign(smsLink(phone, body));
      onLogged(d.messages);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Text message" onClose={onClose}>
      <div className="px-6 pb-5 flex flex-col gap-3">
        <div className="inline-flex self-start bg-chip rounded-full p-1">
          {(["out", "in"] as const).map((d) => (
            <button key={d} onClick={() => setDirection(d)} className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium ${direction === d ? "bg-white shadow-sm" : "text-muted"}`}>
              {d === "out" ? "Send a text" : "Log a text I received"}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[12.5px] font-semibold text-muted">Phone</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(732) 555-0100" className="bg-white border border-line rounded-xl px-3 py-2.5 text-[14px] outline-none" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12.5px] font-semibold text-muted">Message</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="bg-white border border-line rounded-xl px-3 py-2.5 text-[14px] outline-none resize-y" />
        </label>
        {error && <div className="text-[13px] text-[#B42318]">{error}</div>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {direction === "out" ? (
            <>
              <button onClick={() => void log(true)} disabled={busy} className="flex items-center gap-1.5 bg-btn hover:bg-btn-hover disabled:opacity-50 px-4 py-2 rounded-full text-[13.5px] font-medium">
                <MessageSquare size={13} /> Open in Messages &amp; log it
              </button>
              <button onClick={() => void log(false)} disabled={busy} className="bg-chip hover:bg-btn disabled:opacity-50 px-4 py-2 rounded-full text-[13.5px] font-medium">
                Just log it
              </button>
            </>
          ) : (
            <button onClick={() => void log(false)} disabled={busy} className="bg-btn hover:bg-btn-hover disabled:opacity-50 px-4 py-2 rounded-full text-[13.5px] font-medium">
              Save to matter
            </button>
          )}
        </div>
        <div className="text-[12px] text-muted">
          Texts go from your own phone (Messages opens with the text ready). Replies by text aren&apos;t picked up automatically; log them here.
        </div>
      </div>
    </Modal>
  );
}
