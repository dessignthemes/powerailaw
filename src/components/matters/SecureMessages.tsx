"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Loader2, Paperclip, Send, FileText, X, Check, Mail, UserPlus, CheckCheck } from "lucide-react";
import { composeLinks, subjectWithTag } from "@/lib/mail/matterTag";
import { numberOf, type Matter } from "@/components/NewMatterModal";
import type { Client } from "@/components/NewClientModal";

type Attachment = { id: string; title: string; versionId: string | null; fileType: string };
type Msg = { id: string; direction: "firm" | "client"; body: string; senderName: string; readAt: string | null; createdAt: string; attachments: Attachment[] };
type Access = { email: string; status: string; lastLoginAt: string | null } | null;
type Thread = { messages: Msg[]; access: Access; hasClient: boolean; unreadFromClient: number };
type DocLite = { id: string; title: string };

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(d?.error ?? "Something went wrong. Please try again.") as Error & { code?: string };
    err.code = d?.code;
    throw err;
  }
  return d as T;
}
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// After sending: the notice email (no confidential content), from the person's own mailbox.
function notice(opts: { client: Client | null; matter: Matter; firm: string; docs: number; inviteLink: string | null }) {
  const first = opts.client?.name?.split(" ")[0] ?? "";
  const origin = typeof window !== "undefined" ? window.location.origin : "https://lawpower.ai";
  const what = opts.docs ? `a new secure message and ${opts.docs} ${opts.docs === 1 ? "document" : "documents"}` : "a new secure message";
  const link = opts.inviteLink ?? `${origin}/portal`;
  const body = [
    `Hello${first ? ` ${first}` : ""},`,
    "",
    `You have ${what} from ${opts.firm}. For your privacy, it is only available in your secure client portal:`,
    "",
    link,
    "",
    opts.inviteLink ? "The first time, this link lets you set your own password (it works for 14 days)." : "Sign in with your email address and portal password.",
    "",
    "Thank you,",
    opts.firm,
  ].join("\n");
  const subject = subjectWithTag(`New secure message from ${opts.firm}`, numberOf(opts.matter));
  return composeLinks(opts.client?.email ?? "", subject, body);
}

// The matter's secure conversation with the client, through the client portal.
export default function SecureMessages({ matter, client, preselect = [], compact = false }: { matter: Matter; client: Client | null; preselect?: string[]; compact?: boolean }) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState<string[]>(preselect);
  const [docs, setDocs] = useState<DocLite[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(preselect.length > 0);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ firm: string; docs: number } | null>(null);
  const [inviteEmail, setInviteEmail] = useState(client?.email ?? "");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const base = `/api/matters/${matter.id}/portal-messages`;

  const load = useCallback(
    () =>
      getJson<Thread>(base)
        .then((t) => (setThread(t), setError(null)))
        .catch((e: Error) => setError(e.message)),
    [base]
  );
  useEffect(() => {
    void load();
    getJson<{ documents: DocLite[] }>(`/api/documents?matterId=${matter.id}`)
      .then((d) => setDocs(d.documents ?? []))
      .catch(() => setDocs([]));
  }, [load, matter.id]);

  const access = thread?.access ?? null;
  const canSend = access && access.status !== "disabled";

  async function invite() {
    if (!client) return;
    setInviting(true);
    setError(null);
    try {
      const d = await getJson<{ token: string }>(`/api/client-portal/${client.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invite", email: inviteEmail }),
      });
      setInviteLink(`${window.location.origin}/portal/invite/${d.token}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInviting(false);
    }
  }

  async function send() {
    setSending(true);
    setError(null);
    try {
      const d = await getJson<{ firm: string; accessStatus: string }>(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, documentIds: picked }),
      });
      setSent({ firm: d.firm, docs: picked.length });
      setBody("");
      setPicked([]);
      setPickerOpen(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  // Opens an attached file (the client's uploads are saved in the matter's Documents too).
  async function openFile(a: Attachment) {
    if (!a.versionId) return;
    const w = window.open("", "_blank");
    try {
      const d = await getJson<{ url: string }>(`/api/documents/versions/${a.versionId}`);
      if (w) w.location.href = d.url;
      else window.location.assign(d.url);
    } catch (e) {
      w?.close();
      setError((e as Error).message);
    }
  }

  // A client who never set a password needs a (fresh) invite link in the notice.
  const needsInviteLink = access?.status === "invited" && !inviteLink;
  const links = sent ? notice({ client, matter, firm: sent.firm, docs: sent.docs, inviteLink }) : null;

  return (
    <div className="rounded-2xl overflow-hidden border border-line">
      <div className="flex flex-wrap items-center gap-2 bg-card-alt px-4 py-3">
        <ShieldCheck size={15} strokeWidth={1.75} className="text-[#2F9E5A]" />
        <span className="text-[14px] font-semibold">Secure messages</span>
        <span className="text-[12.5px] text-muted">
          {access ? `Client portal · ${access.email}${access.status === "invited" ? " (invited, hasn't signed in yet)" : ""}` : "through the client portal"}
        </span>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {error && <div className="rounded-xl bg-[#FDF1E7] text-[#8A4B14] px-3.5 py-2.5 text-[13px]">{error}</div>}

        {!thread ? (
          <div className="text-[13px] text-muted flex items-center gap-2">
            <Loader2 size={13} className="animate-spin" /> Loading…
          </div>
        ) : !thread.hasClient ? (
          <div className="text-[13px] text-muted">Link this matter to a client to message them securely.</div>
        ) : !canSend ? (
          <div className="rounded-xl bg-[#EEF3FB] px-4 py-3 flex flex-col gap-2">
            <div className="text-[13.5px] font-medium flex items-center gap-1.5">
              <UserPlus size={14} /> {client?.name ?? "This client"} isn&apos;t on the client portal yet
            </div>
            <div className="text-[12.5px] text-muted">Invite them once; they set their own password and can then read your messages and documents securely.</div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="client@example.com"
                className="bg-white border border-line rounded-full px-3.5 py-1.5 text-[13px] outline-none w-[240px]"
              />
              <button onClick={() => void invite()} disabled={inviting || !inviteEmail.trim()} className="flex items-center gap-1.5 bg-btn hover:bg-btn-hover disabled:opacity-50 px-3.5 py-1.5 rounded-full text-[13px] font-medium">
                {inviting && <Loader2 size={12} className="animate-spin" />} Invite to portal
              </button>
            </div>
          </div>
        ) : null}

        {thread && thread.messages.length > 0 && (
          <div className={`flex flex-col gap-2.5 ${compact ? "max-h-[320px]" : "max-h-[460px]"} overflow-y-auto pr-1`}>
            {thread.messages.map((m) => {
              const mine = m.direction === "firm";
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 ${mine ? "bg-[#E1E7F4]" : "bg-white border border-line"}`}>
                    <div className="text-[11.5px] text-muted mb-0.5">
                      {m.senderName} · {when(m.createdAt)}
                    </div>
                    {m.body && <div className="text-[13.5px] whitespace-pre-wrap">{m.body}</div>}
                    {m.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {m.attachments.map((a) => (
                          <button
                            key={a.id}
                            onClick={() => void openFile(a)}
                            title={mine ? "Open" : "Sent by the client: open"}
                            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] hover:underline ${mine ? "bg-white/80" : "bg-[#E8F6EE]"}`}
                          >
                            <FileText size={12} className="text-muted" /> {a.title}
                          </button>
                        ))}
                      </div>
                    )}
                    {mine && (
                      <div className="text-[11px] text-muted mt-1 flex items-center gap-1 justify-end">
                        {m.readAt ? (
                          <>
                            <CheckCheck size={12} className="text-[#2F9E5A]" /> Read {when(m.readAt)}
                          </>
                        ) : (
                          <>
                            <Check size={12} /> Delivered to portal
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {sent && links && (
          <div className="rounded-xl bg-[#E8F6EE] px-4 py-3 flex flex-col gap-2">
            <div className="text-[13.5px] font-medium">Sent securely. Now let {client?.name?.split(" ")[0] ?? "your client"} know:</div>
            <div className="text-[12.5px] text-muted">
              The notice email only says a secure message is waiting; nothing confidential goes by email.
              {needsInviteLink && " They haven't set a password yet, so include a fresh sign-up link:"}
            </div>
            <div className="flex flex-wrap gap-2">
              {needsInviteLink ? (
                <button onClick={() => void invite()} disabled={inviting} className="flex items-center gap-1.5 bg-btn hover:bg-btn-hover disabled:opacity-50 px-3.5 py-1.5 rounded-full text-[13px] font-medium">
                  {inviting && <Loader2 size={12} className="animate-spin" />} Create sign-up link
                </button>
              ) : (
                <>
                  <a href={links.google} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-btn hover:bg-btn-hover px-3.5 py-1.5 rounded-full text-[13px] font-medium">
                    <Mail size={13} /> Notify in Gmail
                  </a>
                  <a href={links.microsoft} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3.5 py-1.5 rounded-full text-[13px] font-medium">
                    Notify in Outlook
                  </a>
                  <a href={links.app} className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3.5 py-1.5 rounded-full text-[13px] font-medium">
                    Mail app
                  </a>
                </>
              )}
              <button onClick={() => setSent(null)} className="ml-auto text-muted hover:text-ink" aria-label="Dismiss">
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {canSend && (
          <div className="flex flex-col gap-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={compact ? 3 : 4}
              placeholder={`Write a secure message to ${client?.name?.split(" ")[0] ?? "your client"}…`}
              className="bg-white border border-line rounded-xl px-3 py-2.5 text-[14px] outline-none resize-y"
            />
            {picked.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {picked.map((id) => (
                  <span key={id} className="flex items-center gap-1 bg-card-alt rounded-lg pl-2 pr-1 py-1 text-[12.5px]">
                    <FileText size={12} className="text-muted" /> {docs?.find((d) => d.id === id)?.title ?? "Document"}
                    <button onClick={() => setPicked((p) => p.filter((x) => x !== id))} aria-label="Remove" className="w-5 h-5 rounded-full hover:bg-white flex items-center justify-center">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {pickerOpen && (
              <div className="rounded-xl border border-line bg-white max-h-[200px] overflow-y-auto p-1.5">
                {docs === null ? (
                  <div className="px-2 py-2 text-[12.5px] text-muted">Loading documents…</div>
                ) : docs.length === 0 ? (
                  <div className="px-2 py-2 text-[12.5px] text-muted">This matter has no documents yet.</div>
                ) : (
                  docs.map((d) => (
                    <label key={d.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-chip text-[13px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={picked.includes(d.id)}
                        onChange={(e) => setPicked((p) => (e.target.checked ? [...p, d.id] : p.filter((x) => x !== d.id)))}
                        className="accent-[#1b191a]"
                      />
                      <span className="truncate">{d.title}</span>
                    </label>
                  ))
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setPickerOpen((o) => !o)} className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3.5 py-1.5 rounded-full text-[13px] font-medium">
                <Paperclip size={13} /> Attach documents
              </button>
              <span className="text-[12px] text-muted">Attached documents become visible to the client in their portal.</span>
              <button
                onClick={() => void send()}
                disabled={sending || (!body.trim() && !picked.length)}
                className="ml-auto flex items-center gap-1.5 bg-btn hover:bg-btn-hover disabled:opacity-50 px-4 py-2 rounded-full text-[13.5px] font-medium"
              >
                {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send securely
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
