"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Mail, Loader2, KeyRound, ShieldCheck, UserX, UserCheck, ExternalLink } from "lucide-react";

type Status = {
  clientEmail: string | null;
  access: { email: string; status: "invited" | "active" | "disabled"; invitedAt: string | null; inviteExpiresAt: string | null; lastLoginAt: string | null; hasPassword: boolean } | null;
  sharedDocumentIds: string[];
  events: { type: string; documentTitle: string | null; at: string }[];
};

const when = (s: string) => new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const eventText: Record<string, string> = { invited: "Invite link created", joined: "Created their password", login: "Signed in", viewed: "Viewed", downloaded: "Downloaded" };

async function api(clientId: string, body?: unknown) {
  const res = await fetch(`/api/client-portal/${clientId}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d?.error ?? "Something went wrong. Please try again.");
  return d;
}

function inviteEmail(to: string, firm: string, clientName: string, link: string, expiresAt: string, existing: boolean) {
  const first = clientName.split(" ")[0] || "";
  const date = new Date(expiresAt).toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const subject = existing ? `Reset your client portal password – ${firm}` : `Your secure client portal – ${firm}`;
  const body =
    `Hello${first ? ` ${first}` : ""},\n\n` +
    (existing
      ? `Use this link to set a new password for your client portal:\n${link}\n\n`
      : `We've set up a secure client portal where you can view and download the documents we share with you.\n\nTo get started, open this link and create your password:\n${link}\n\n`) +
    `Your sign-in email is: ${to}\nThe link works until ${date}.\n\nAfter that, you can always sign in at:\n${window.location.origin}/portal/login\n\nBest regards,\n${firm}`;
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function PortalView({ clientId, defaultEmail }: { clientId: string | null; defaultEmail?: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ link: string; mailto: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    let live = true;
    api(clientId)
      .then((d: Status) => {
        if (!live) return;
        setStatus(d);
        if (d.access?.email) setEmail(d.access.email);
        else if (!defaultEmail && d.clientEmail) setEmail(d.clientEmail);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [clientId, defaultEmail]);

  if (!clientId) return <div className="py-14 text-center text-[14px] text-muted">Save this card first to set up the client portal.</div>;

  const reload = async () => setStatus(await api(clientId));

  async function sendInvite() {
    setBusy("invite");
    setError(null);
    try {
      const existing = !!status?.access?.hasPassword;
      const d = await api(clientId!, { action: "invite", email });
      const link = `${window.location.origin}/portal/invite/${d.token}`;
      setInvite({ link, mailto: inviteEmail(d.email, d.firm, d.clientName, link, d.expiresAt, existing) });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function toggle(enable: boolean) {
    if (!enable && !confirm("Turn off portal access? The client is signed out and can’t sign in until you turn it back on.")) return;
    setBusy("toggle");
    setError(null);
    try {
      await api(clientId!, { action: enable ? "enable" : "disable" });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const a = status?.access;
  const badge = !a ? null : a.status === "active" ? ["Active", "bg-[#CAF0D9]"] : a.status === "invited" ? ["Invited", "bg-[#F9E1C0]"] : ["Turned off", "bg-card-alt"];

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">Client portal</div>
        {badge && <span className={`text-[12px] font-medium rounded-md px-1.5 py-0.5 ${badge[1]}`}>{badge[0]}</span>}
      </div>
      <p className="text-[13.5px] text-muted mb-5 max-w-[620px]">
        Give this client a secure login where they can view and download the documents you share with them. Choose what they see with the <b>Client can see</b> switch in <b>Documents</b>.
      </p>

      {error && <div className="mb-4 rounded-xl bg-[#FDF1E7] text-[#8A4B14] px-4 py-3 text-[13.5px]">{error}</div>}

      {status === null && !error ? (
        <div className="text-[13.5px] text-muted flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>
      ) : status ? (
        <>
          <div className="bg-card-alt rounded-2xl p-4 max-w-[620px]">
            <label className="grid gap-1 mb-3">
              <span className="text-[13px] text-muted">Client’s sign-in email</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="client@example.com" className="w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-[13.5px] outline-none focus:border-btn-ring" />
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={sendInvite} disabled={!!busy || !email.trim()} className="flex items-center gap-1.5 bg-btn hover:bg-btn-hover px-4 py-2 rounded-full text-[13.5px] font-medium transition-colors disabled:opacity-50">
                {busy === "invite" ? <Loader2 size={13} className="animate-spin" /> : a?.hasPassword ? <KeyRound size={13} /> : <Mail size={13} />}
                {!a ? "Invite to portal" : a.hasPassword ? "Send password reset link" : "Create a new invite link"}
              </button>
              {a && a.status !== "disabled" && (
                <button onClick={() => toggle(false)} disabled={!!busy} className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors">
                  <UserX size={13} /> Turn off access
                </button>
              )}
              {a?.status === "disabled" && (
                <button onClick={() => toggle(true)} disabled={!!busy} className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors">
                  <UserCheck size={13} /> Turn access back on
                </button>
              )}
            </div>
            {a && (
              <div className="mt-3 text-[12.5px] text-muted">
                {a.lastLoginAt ? `Last signed in ${when(a.lastLoginAt)}.` : a.hasPassword ? "Hasn’t signed in yet." : `Invited ${a.invitedAt ? when(a.invitedAt) : ""}; hasn’t created a password yet.`}
                {a.inviteExpiresAt && !a.hasPassword && ` The invite link works until ${new Date(a.inviteExpiresAt).toLocaleDateString()}.`}
              </div>
            )}
          </div>

          {invite && (
            <div className="mt-4 max-w-[620px] bg-[#E6F6EC] rounded-2xl p-4">
              <div className="text-[13.5px] mb-2"><b>The invite link is ready.</b> Email it to the client from your mailbox. For safety, LawPower can’t show this link again.</div>
              <div className="flex items-center gap-2">
                <input readOnly value={invite.link} onFocus={(e) => e.target.select()} className="flex-1 bg-white border border-line rounded-xl px-3 py-2 text-[12.5px] font-mono outline-none" />
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(invite.link);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="flex items-center gap-1.5 bg-white hover:bg-btn px-3 py-2 rounded-full text-[13px] font-medium transition-colors"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <a href={invite.mailto} className="mt-3 inline-flex items-center gap-1.5 bg-btn hover:bg-btn-hover px-4 py-2 rounded-full text-[13.5px] font-medium transition-colors">
                <Mail size={13} /> Email the invite
              </a>
            </div>
          )}

          <div className="mt-6 max-w-[620px]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">Shared documents</div>
              <a href="/portal/login" target="_blank" rel="noopener" className="text-[12.5px] text-muted hover:text-ink flex items-center gap-1">
                Client sign-in page <ExternalLink size={11} />
              </a>
            </div>
            <div className="text-[13.5px]">
              {status.sharedDocumentIds.length === 0
                ? "Nothing shared yet. Open Documents and switch on “Client can see” for the files this client should see."
                : `${status.sharedDocumentIds.length} document${status.sharedDocumentIds.length === 1 ? "" : "s"} shared. Change this in Documents.`}
            </div>
          </div>

          <div className="mt-6 max-w-[620px]">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5"><ShieldCheck size={12} /> Activity</div>
            {status.events.length === 0 ? (
              <div className="text-[13px] text-muted">No activity yet.</div>
            ) : (
              <div className="flex flex-col gap-1">
                {status.events.map((e, i) => (
                  <div key={i} className="text-[13px] flex gap-3">
                    <span className="text-muted w-[130px] flex-shrink-0">{when(e.at)}</span>
                    <span>{eventText[e.type] ?? e.type}{e.documentTitle ? `: ${e.documentTitle}` : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
