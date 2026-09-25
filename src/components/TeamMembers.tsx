"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Copy, Check, Mail, Trash2, RefreshCw, X, Info } from "lucide-react";

type Member = { id: string; email: string; role: "owner" | "admin" | "member"; joinedAt: string };
type Invite = { id: string; email: string; role: "admin" | "member"; invited_by_email: string | null; expires_at: string; expired: boolean };
type Team = {
  me: { id: string; email: string; role: Member["role"] };
  members: Member[];
  invites: Invite[];
  domain: string;
  canManage: boolean;
  canInvite: boolean;
  inviteBlockedReason: string | null;
};

const roleLabel = { owner: "Owner", admin: "Admin", member: "Member" } as const;

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? "Something went wrong.");
  return data as T;
}

export default function TeamMembers({ onChanged }: { onChanged?: () => void }) {
  const [team, setTeam] = useState<Team | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);
  const [freshLink, setFreshLink] = useState<{ email: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(
    () =>
      call<Team>("/api/team")
        .then((t) => {
          setTeam(t);
          setError(null);
        })
        .catch((e: Error) => setError(e.message)),
    []
  );

  useEffect(() => {
    let cancelled = false;
    call<Team>("/api/team")
      .then((t) => !cancelled && setTeam(t))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  async function invite() {
    setBusy(true);
    setError(null);
    try {
      const d = await call<{ link: string; invite: { email: string } }>("/api/team/invites", { method: "POST", body: JSON.stringify({ email, role }) });
      setFreshLink({ email: d.invite.email, link: d.link });
      setEmail("");
      setInviteOpen(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function inviteAction(inv: Invite, action: "new_link" | "revoke") {
    setError(null);
    try {
      const d = await call<{ link?: string }>(`/api/team/invites/${inv.id}`, { method: "POST", body: JSON.stringify({ action }) });
      if (d.link) setFreshLink({ email: inv.email, link: d.link });
      if (action === "revoke" && freshLink?.email === inv.email) setFreshLink(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function memberRole(m: Member, r: "admin" | "member") {
    setError(null);
    try {
      await call(`/api/team/members/${m.id}`, { method: "PATCH", body: JSON.stringify({ role: r }) });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(m: Member) {
    if (!confirm(`Remove ${m.email} from the workspace? They lose access to the team's clients, matters and tasks. Their work stays with the team.`)) return;
    setError(null);
    try {
      await call(`/api/team/members/${m.id}`, { method: "DELETE" });
      await load();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function copy(link: string) {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const mailto = (to: string, link: string) =>
    `mailto:${to}?subject=${encodeURIComponent("Join our team on LawPower AI")}&body=${encodeURIComponent(
      `Hi,\n\nI've invited you to our team workspace on LawPower AI. Open this link and sign in with ${to}:\n\n${link}\n\nThe link works once and expires in 14 days.`
    )}`;

  if (!team) {
    return error ? (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700 mb-9">{error}</div>
    ) : (
      <div className="flex items-center gap-2 text-[14px] text-muted py-8">
        <Loader2 size={15} className="animate-spin" /> Loading team…
      </div>
    );
  }

  return (
    <div className="mb-9">
      <div className="flex items-start justify-between mb-1.5">
        <h2 className="text-[26px] font-semibold mt-1">Members ({team.members.length})</h2>
        {team.canInvite && (
          <button
            onClick={() => setInviteOpen((o) => !o)}
            className="bg-dark text-white px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors flex-shrink-0"
          >
            Invite member
          </button>
        )}
      </div>
      <p className="text-[14px] text-muted mb-5">
        Everyone in this workspace shares clients, matters, documents and tasks.
        {team.canInvite && <> You can invite colleagues with an <span className="text-ink font-medium">@{team.domain}</span> email address.</>}
      </p>

      {team.inviteBlockedReason && team.me.role !== "member" && (
        <div className="flex gap-2.5 rounded-xl bg-card-alt px-4 py-3 text-[13px] mb-5">
          <Info size={15} className="flex-shrink-0 mt-0.5 text-muted" />
          <span>{team.inviteBlockedReason}</span>
        </div>
      )}

      {inviteOpen && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <input
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && invite()}
            placeholder={`colleague@${team.domain}`}
            className="flex-1 min-w-[220px] bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none focus:border-ink"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "member" | "admin")}
            className="bg-white border border-line rounded-xl px-3 py-2.5 text-[14px] outline-none"
            aria-label="Role"
          >
            <option value="member">Member</option>
            {team.me.role === "owner" && <option value="admin">Admin</option>}
          </select>
          <button
            onClick={invite}
            disabled={busy || !email.trim()}
            className="bg-dark text-white px-4 py-2.5 rounded-full text-[13.5px] font-medium hover:bg-dark2 disabled:opacity-50 flex items-center gap-1.5"
          >
            {busy && <Loader2 size={13} className="animate-spin" />} Create invite
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700 mb-5 flex justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {freshLink && (
        <div className="rounded-2xl border border-[#B9D6B2] bg-[#F1F7EF] px-4 py-4 mb-5">
          <div className="text-[13.5px] font-semibold mb-1">Invite ready for {freshLink.email}</div>
          <p className="text-[12.5px] text-muted mb-3">
            Send them this link. It works once, only when they sign in as {freshLink.email}, and expires in 14 days. For security it&apos;s only shown now; you can
            create a new link later.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="flex-1 min-w-[200px] bg-white border border-line rounded-lg px-3 py-2 text-[12px] truncate">{freshLink.link}</code>
            <button onClick={() => copy(freshLink.link)} className="flex items-center gap-1.5 bg-dark text-white px-3.5 py-2 rounded-full text-[13px] font-medium hover:bg-dark2">
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy link"}
            </button>
            <a href={mailto(freshLink.email, freshLink.link)} className="flex items-center gap-1.5 bg-white border border-line px-3.5 py-2 rounded-full text-[13px] font-medium hover:border-muted">
              <Mail size={13} /> Email invite
            </a>
          </div>
        </div>
      )}

      <div className="border border-line rounded-2xl divide-y divide-line">
        {team.members.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-4 px-5 py-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-7 h-7 rounded-full bg-dark text-white flex items-center justify-center text-[12px] font-medium flex-shrink-0">
                {m.email.charAt(0).toUpperCase()}
              </span>
              <span className="text-[14.5px] font-medium truncate">
                {m.email}
                {m.id === team.me.id && <span className="text-muted font-normal"> (you)</span>}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {team.me.role === "owner" && m.role !== "owner" ? (
                <select
                  value={m.role}
                  onChange={(e) => memberRole(m, e.target.value as "admin" | "member")}
                  className="bg-card-alt rounded-full px-3 py-1 text-[12.5px] font-medium outline-none"
                  aria-label={`Role for ${m.email}`}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              ) : (
                <span className={`px-3 py-1 rounded-full text-[12.5px] font-medium ${m.role === "owner" ? "bg-dark text-white" : "bg-card-alt text-muted"}`}>
                  {roleLabel[m.role]}
                </span>
              )}
              {team.canManage && m.role !== "owner" && m.id !== team.me.id && !(m.role === "admin" && team.me.role !== "owner") && (
                <button
                  onClick={() => remove(m)}
                  className="w-7 h-7 rounded-full hover:bg-red-50 flex items-center justify-center text-muted hover:text-red-500 transition-colors"
                  aria-label={`Remove ${m.email}`}
                >
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              )}
            </div>
          </div>
        ))}
        {team.invites.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between gap-4 px-5 py-4 flex-wrap">
            <div className="min-w-0">
              <div className="text-[14.5px] font-medium truncate">{inv.email}</div>
              <div className="text-[12px] text-muted">
                {inv.expired ? "Invite expired" : `Invited as ${roleLabel[inv.role].toLowerCase()} · expires ${new Date(inv.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="bg-card-alt px-3 py-1 rounded-full text-[12.5px] font-medium text-muted">{inv.expired ? "Expired" : "Pending"}</span>
              <button
                onClick={() => inviteAction(inv, "new_link")}
                title="Create a new invite link"
                className="w-7 h-7 rounded-full hover:bg-card-alt flex items-center justify-center text-muted hover:text-ink"
                aria-label={`New link for ${inv.email}`}
              >
                <RefreshCw size={13} strokeWidth={1.75} />
              </button>
              <button
                onClick={() => inviteAction(inv, "revoke")}
                title="Cancel invite"
                className="w-7 h-7 rounded-full hover:bg-red-50 flex items-center justify-center text-muted hover:text-red-500"
                aria-label={`Cancel invite for ${inv.email}`}
              >
                <Trash2 size={14} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
