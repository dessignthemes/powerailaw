"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, Send, Globe, Copy, Check, X, ChevronDown, UserPlus, Phone, Mail, Trash2, ExternalLink, Code2 } from "lucide-react";
import { STATUS_LABEL, leadName, type Lead, type LeadStatus } from "@/lib/leads";

// Potential leads: prospective clients who filled in the intake form (from the
// firm's website or a link we sent them). "Import into Client Intake" turns one
// into a client card.

type Tab = "new" | "invited" | "contacted" | "converted" | "declined";
const TABS: { key: Tab; label: string }[] = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "invited", label: "Link sent" },
  { key: "converted", label: "Became clients" },
  { key: "declined", label: "Declined" },
];
const STATUS_CLS: Record<LeadStatus, string> = {
  new: "bg-[#E1E7F5] text-ink",
  invited: "bg-chip text-muted",
  contacted: "bg-[#FFF4E5] text-[#8A4B14]",
  converted: "bg-[#F1F7EF] text-[#2F5E2A]",
  declined: "bg-chip text-muted",
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

async function readJson(r: Response) {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d?.error ?? "Something went wrong."), { code: d?.code });
  return d;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3 py-2 rounded-full text-[12.5px] font-medium flex-shrink-0"
    >
      {done ? <Check size={13} /> : <Copy size={13} />} {done ? "Copied" : label}
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/25 flex items-center justify-center px-4 py-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={title} className="bg-page rounded-2xl w-full max-w-[600px] max-h-full overflow-y-auto shadow-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[18px] font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const input = "w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none focus:border-btn-ring";

function InviteModal({ onClose, onDone }: { onClose: () => void; onDone: (l: Lead) => void }) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [send, setSend] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; sent: boolean; sendError: string | null } | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      const d = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite", firstName: first, lastName: last, email, message, send }) }).then(readJson);
      onDone(d.lead as Lead);
      setResult({ url: d.url, sent: d.sent, sendError: d.sendError });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Send an intake link" onClose={onClose}>
      {result ? (
        <div>
          <div className={`rounded-xl px-4 py-3 text-[13.5px] mb-3 ${result.sent ? "bg-[#F1F7EF] text-[#2F5E2A]" : "bg-[#FFF4E5] text-[#8A4B14]"}`}>
            {result.sent ? `The link was emailed to ${email} from your mailbox.` : result.sendError ?? "Copy the link below and send it to them."}
          </div>
          <div className="text-[12.5px] font-semibold text-muted mb-1">Their personal link</div>
          <div className="flex items-center gap-2">
            <input readOnly value={result.url} className={`${input} text-[12.5px]`} onFocus={(e) => e.target.select()} />
            <CopyButton text={result.url} />
          </div>
          <p className="text-[12.5px] text-muted mt-2">When they fill it in, the lead moves from &quot;Link sent&quot; to &quot;New&quot; and you get an alert.</p>
          <div className="flex justify-end mt-4">
            <button onClick={onClose} className="bg-btn hover:bg-btn-hover px-4 py-2.5 rounded-full text-[13.5px] font-medium">
              Done
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-[13px] text-muted mb-4">The prospective client gets a personal link to the intake form, already started with their name and email.</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" className={input} />
            <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" className={input} />
          </div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className={`${input} mb-3`} />
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Message (optional). Default: Thank you for contacting our office. To help us prepare for your consultation, please fill in our short intake form." className={`${input} resize-none mb-3`} />
          <label className="flex items-center gap-2 text-[13.5px] mb-4 cursor-pointer">
            <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} className="w-4 h-4 accent-[#5E6E8C]" />
            Email it from my mailbox (with my signature)
          </label>
          {error && <div className="mb-3 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-3.5 py-2 text-[13px]">{error}</div>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2.5 rounded-full text-[13.5px] font-medium bg-chip hover:bg-btn">
              Cancel
            </button>
            <button onClick={go} disabled={busy || !email.trim()} className="px-4 py-2.5 rounded-full text-[13.5px] font-medium bg-btn hover:bg-btn-hover disabled:opacity-50 flex items-center gap-2">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {send ? "Send link" : "Create link"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function WebsiteModal({ url, onClose }: { url: string; onClose: () => void }) {
  const embed = `<iframe src="${url}?embed=1" title="New client intake" style="width:100%;min-height:1500px;border:0;" loading="lazy"></iframe>`;
  const button = `<a href="${url}" target="_blank" rel="noopener">Start your intake form</a>`;
  return (
    <Modal title="Intake form for your website" onClose={onClose}>
      <p className="text-[13px] text-muted mb-4">Everyone who fills it in shows up here as a new lead, and you get an alert. Give one of these to whoever manages the website (www.rapciewiczlaw.com).</p>
      <div className="text-[12.5px] font-semibold text-muted mb-1">1. The form&apos;s address (link to it from a &quot;Contact us&quot; or &quot;Get started&quot; button)</div>
      <div className="flex items-center gap-2 mb-4">
        <input readOnly value={url} className={`${input} text-[12.5px]`} onFocus={(e) => e.target.select()} />
        <CopyButton text={url} />
        <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-chip hover:bg-btn px-3 py-2 rounded-full text-[12.5px] font-medium flex-shrink-0">
          <ExternalLink size={13} /> Open
        </a>
      </div>
      <div className="text-[12.5px] font-semibold text-muted mb-1">2. Or put the form right on a page (paste into the page&apos;s HTML)</div>
      <div className="flex items-start gap-2 mb-4">
        <textarea readOnly value={embed} rows={3} className={`${input} text-[12px] font-mono resize-none`} onFocus={(e) => e.target.select()} />
        <CopyButton text={embed} />
      </div>
      <div className="text-[12.5px] font-semibold text-muted mb-1">3. Or a simple button link</div>
      <div className="flex items-start gap-2">
        <textarea readOnly value={button} rows={2} className={`${input} text-[12px] font-mono resize-none`} onFocus={(e) => e.target.select()} />
        <CopyButton text={button} />
      </div>
    </Modal>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div className="min-w-0">
      <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="text-[13.5px] whitespace-pre-wrap break-words">{value}</div>
    </div>
  );
}

function LeadRow({ lead, open, onToggle, onChange, onDelete }: { lead: Lead; open: boolean; onToggle: () => void; onChange: (l: Lead) => void; onDelete: (id: string) => void }) {
  const router = useRouter();
  const [notes, setNotes] = useState(lead.notes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const d = await fetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(readJson);
      onChange(d.lead as Lead);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const address = [lead.street, [lead.city, lead.state].filter(Boolean).join(", "), lead.zip].filter(Boolean).join(" ");
  return (
    <div id={`lead-${lead.id}`} className="border-b border-line last:border-b-0">
      <button onClick={onToggle} className="w-full text-left px-5 py-3.5 flex items-center gap-4 hover:bg-[#F7F9FC]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14.5px] font-semibold">{leadName(lead)}</span>
            {lead.matterType && <span className="text-[12.5px] text-muted">· {lead.matterType}</span>}
          </div>
          <div className="text-[12.5px] text-muted truncate">{[lead.email, lead.phone].filter(Boolean).join(" · ") || "No contact details"}{lead.description ? ` · ${lead.description.slice(0, 120)}` : ""}</div>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold whitespace-nowrap ${STATUS_CLS[lead.status]}`}>{STATUS_LABEL[lead.status]}</span>
        <span className="text-[12.5px] text-muted w-[92px] text-right whitespace-nowrap">{when(lead.submittedAt ?? lead.createdAt)}</span>
        <ChevronDown size={16} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-5 pb-5">
          {lead.status === "invited" && !lead.submittedAt && <div className="text-[13px] text-muted mb-3">Link sent {when(lead.createdAt)}; not filled in yet.</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 bg-white border border-line rounded-xl p-4 mb-3">
            <Field label="Name" value={[lead.title, lead.firstName, lead.lastName].filter(Boolean).join(" ")} />
            <Field label="Company" value={lead.company} />
            <Field label="Email" value={lead.email} />
            <Field label="Phone" value={lead.phone} />
            <Field label="Best way / time" value={[lead.preferredContact, lead.bestTime].filter(Boolean).join(" · ")} />
            <Field label="Address" value={address} />
            <Field label="Needs help with" value={lead.matterType} />
            <Field label="Others involved" value={lead.otherParties} />
            <Field label="Heard about us" value={lead.referredBy} />
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Their situation" value={lead.description} />
            </div>
            <Field label="Came from" value={lead.source === "website" ? "Website form" : lead.source === "link" ? "Link we sent" : "Entered by the firm"} />
          </div>
          <label className="block text-[12.5px] font-semibold text-muted mb-1">Our notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== lead.notes && void patch({ notes })} rows={2} placeholder="e.g. Called back Oct 30, consultation Tuesday" className={`${input} resize-y mb-3`} />
          <div className="flex items-center gap-2 flex-wrap">
            {lead.status !== "converted" ? (
              <button onClick={() => router.push(`/dashboard/client-intake?lead=${lead.id}`)} className="bg-btn hover:bg-btn-hover px-4 py-2 rounded-full text-[13px] font-medium flex items-center gap-1.5">
                <UserPlus size={14} /> Import into Client Intake
              </button>
            ) : lead.clientId ? (
              <Link href={`/dashboard/client-intake?card=${lead.clientId}`} className="bg-btn hover:bg-btn-hover px-4 py-2 rounded-full text-[13px] font-medium flex items-center gap-1.5">
                <UserPlus size={14} /> Open client card
              </Link>
            ) : null}
            {lead.status !== "contacted" && lead.status !== "converted" && (
              <button onClick={() => patch({ status: "contacted" })} disabled={busy} className="bg-chip hover:bg-btn px-4 py-2 rounded-full text-[13px] font-medium flex items-center gap-1.5 disabled:opacity-50">
                <Phone size={14} /> Mark contacted
              </button>
            )}
            {lead.status !== "declined" && lead.status !== "converted" && (
              <button onClick={() => patch({ status: "declined" })} disabled={busy} className="bg-chip hover:bg-btn px-4 py-2 rounded-full text-[13px] font-medium disabled:opacity-50">
                Decline
              </button>
            )}
            {(lead.status === "declined" || lead.status === "contacted") && (
              <button onClick={() => patch({ status: lead.submittedAt ? "new" : "invited" })} disabled={busy} className="bg-chip hover:bg-btn px-4 py-2 rounded-full text-[13px] font-medium disabled:opacity-50">
                Back to {lead.submittedAt ? "New" : "Link sent"}
              </button>
            )}
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="bg-chip hover:bg-btn px-4 py-2 rounded-full text-[13px] font-medium flex items-center gap-1.5">
                <Mail size={14} /> Email
              </a>
            )}
            {lead.status === "invited" &&
              (link ? (
                <CopyButton text={link} label="Copy their link" />
              ) : (
                <button
                  onClick={async () => {
                    try {
                      setLink((await fetch(`/api/leads/${lead.id}?link=1`).then(readJson)).url);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                  className="bg-chip hover:bg-btn px-4 py-2 rounded-full text-[13px] font-medium"
                >
                  Show their link
                </button>
              ))}
            <button
              onClick={async () => {
                if (!window.confirm(`Delete the lead for ${leadName(lead)}? This can't be undone.`)) return;
                try {
                  await fetch(`/api/leads/${lead.id}`, { method: "DELETE" }).then(readJson);
                  onDelete(lead.id);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
              title="Delete lead"
              aria-label="Delete lead"
              className="ml-auto w-9 h-9 rounded-full hover:bg-chip text-muted hover:text-ink flex items-center justify-center"
            >
              <Trash2 size={15} />
            </button>
          </div>
          {error && <div className="mt-2 text-[13px] text-[#9F1D1D]">{error}</div>}
        </div>
      )}
    </div>
  );
}

function LeadsInner() {
  const params = useSearchParams();
  const focus = params.get("lead");
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(focus);
  const [modal, setModal] = useState<"invite" | "website" | null>(null);

  useEffect(() => {
    fetch("/api/leads")
      .then(readJson)
      .then((d) => {
        setLeads(d.leads as Lead[]);
        setLink(d.link?.url ?? null);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLeads([]);
      });
  }, []);

  const focused = focus && leads ? leads.find((l) => l.id === focus) : null;
  const active: Tab = tab ?? (focused ? focused.status : "new");
  useEffect(() => {
    if (focused) document.getElementById(`lead-${focused.id}`)?.scrollIntoView({ block: "center" });
  }, [focused]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { new: 0, invited: 0, contacted: 0, converted: 0, declined: 0 };
    for (const l of leads ?? []) c[l.status]++;
    return c;
  }, [leads]);
  const shown = (leads ?? []).filter(
    (l) => l.status === active && (!q.trim() || `${leadName(l)} ${l.email} ${l.phone} ${l.matterType} ${l.description}`.toLowerCase().includes(q.trim().toLowerCase()))
  );
  const update = (l: Lead) => setLeads((list) => (list ?? []).map((x) => (x.id === l.id ? l : x)));

  return (
    <div className="px-10 py-10 max-w-[1150px]">
      <div className="flex items-start justify-between gap-4 mb-1 flex-wrap">
        <h1 className="text-[28px] font-semibold">Potential Leads</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setModal("website")} disabled={!link} className="bg-chip hover:bg-btn px-4 py-2.5 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 disabled:opacity-50">
            <Code2 size={15} /> Website form
          </button>
          <button onClick={() => setModal("invite")} className="bg-btn hover:bg-btn-hover px-4 py-2.5 rounded-full text-[13.5px] font-medium flex items-center gap-1.5">
            <Send size={15} /> Send intake link
          </button>
        </div>
      </div>
      <p className="text-[14.5px] text-muted mb-6 max-w-[820px]">
        Prospective clients who filled in your intake form, on your website or from a link you sent them. When you decide to take one on, click <b className="text-ink font-medium">Import into Client Intake</b> and their details fill in a new client card.
      </p>

      {link && (
        <div className="flex items-center gap-3 bg-card-alt rounded-2xl px-5 py-3.5 mb-5 flex-wrap">
          <Globe size={16} className="text-muted" />
          <span className="text-[13px] text-muted">Your intake form:</span>
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium underline underline-offset-2 truncate max-w-[420px]">
            {link}
          </a>
          <span className="ml-auto">
            <CopyButton text={link} label="Copy link" />
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 border-b border-line mb-5 flex-wrap">
        <div className="flex items-center gap-6" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={active === t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 pb-3 -mb-px border-b-2 text-[14.5px] font-medium ${active === t.key ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {t.label}
              {counts[t.key] > 0 && <span className={`min-w-[22px] h-[20px] px-1.5 rounded-full text-[12px] font-semibold flex items-center justify-center ${active === t.key ? "bg-btn" : "bg-chip text-muted"}`}>{counts[t.key]}</span>}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 bg-white border border-line rounded-full px-3.5 py-2 mb-2 w-[260px] focus-within:border-btn-ring">
          <Search size={14} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, email, need" className="flex-1 bg-transparent outline-none text-[13.5px]" />
        </label>
      </div>

      {error && <div className="mb-4 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3 text-[13.5px]">{error}</div>}

      <div className="border border-line rounded-2xl bg-white overflow-hidden">
        {leads === null ? (
          <div className="flex items-center gap-2 text-[14px] text-muted px-5 py-8">
            <Loader2 size={15} className="animate-spin" /> Loading…
          </div>
        ) : shown.length === 0 ? (
          <div className="text-center px-6 py-14 text-[14px] text-muted">
            {q ? "No leads match that filter." : active === "new" ? "No new leads. Put the intake form on your website, or send someone an intake link." : "Nothing here yet."}
          </div>
        ) : (
          shown.map((l) => (
            <LeadRow key={l.id} lead={l} open={openId === l.id} onToggle={() => setOpenId((o) => (o === l.id ? null : l.id))} onChange={update} onDelete={(id) => setLeads((list) => (list ?? []).filter((x) => x.id !== id))} />
          ))
        )}
      </div>

      {modal === "invite" && (
        <InviteModal
          onClose={() => setModal(null)}
          onDone={(l) => {
            setLeads((list) => [l, ...(list ?? [])]);
            setTab("invited");
          }}
        />
      )}
      {modal === "website" && link && <WebsiteModal url={link} onClose={() => setModal(null)} />}
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={null}>
      <LeadsInner />
    </Suspense>
  );
}
