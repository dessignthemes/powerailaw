"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Phone, PhoneIncoming, PhoneOutgoing, Laptop, Mail, MessageSquare, Mic, MessagesSquare, Plus, ChevronDown, Loader2, X, Check, Trash2, Search, ListChecks,
} from "lucide-react";
import ClickAway from "@/components/ClickAway";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";

type View = "calls" | "portals" | "emails" | "texts" | "meetings" | "internal";
type MatterRef = { id: string; number: string | null; title: string } | null;
type Comm = {
  id: string; kind: "call" | "internal"; direction: "in" | "out" | ""; contactName: string; contactPhone: string; matter: MatterRef; subject: string; body: string;
  occurredAt: string; durationMin: number | null; callbackNeeded: boolean; callbackDoneAt: string | null; taskId: string | null;
  recipients: { id: string; name: string }[]; createdBy: { id: string; name: string } | null;
};

const SECTIONS: { key: View; label: string; icon: typeof Phone }[] = [
  { key: "calls", label: "Phone logs", icon: Phone },
  { key: "portals", label: "Client portals", icon: Laptop },
  { key: "emails", label: "Emails", icon: Mail },
  { key: "texts", label: "Text messages", icon: MessageSquare },
  { key: "meetings", label: "Meetings", icon: Mic },
  { key: "internal", label: "Internal messages", icon: MessagesSquare },
];

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const input = "bg-white border border-line rounded-lg px-3 py-2 text-[13.5px] outline-none focus:border-btn-ring";
async function readJson(res: Response) {
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(d?.error ?? "Something went wrong."), { code: d?.code });
  return d;
}
const localNow = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

function MatterBadge({ m }: { m: MatterRef }) {
  if (!m) return null;
  return (
    <Link href={`/dashboard/matters/${m.id}`} title={m.title} className="text-[11.5px] font-semibold bg-[#E1E7F4] rounded-md px-1.5 py-px hover:underline underline-offset-2 flex-shrink-0">
      {m.number ?? m.title.slice(0, 24)}
    </Link>
  );
}

// Searchable matter picker (number or name).
function MatterPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { matters } = useWorkspaceData();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const picked = matters.find((m) => m.id === value);
  const list = matters.filter((m) => m.status !== "Closed").filter((m) => !q.trim() || `${m.matterNumber ?? ""} ${m.title}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 30);
  if (picked)
    return (
      <div className="flex items-center gap-2 border border-line rounded-lg px-3 py-2 bg-white">
        <span className="font-semibold text-[13px]">{picked.matterNumber ?? "Matter"}</span>
        <span className="truncate text-muted text-[13px]">{picked.title}</span>
        <button type="button" onClick={() => onChange("")} className="ml-auto text-muted hover:text-ink" aria-label="Remove matter">
          <X size={14} />
        </button>
      </div>
    );
  return (
    <div className="relative">
      <input value={q} onChange={(e) => (setQ(e.target.value), setOpen(true))} onFocus={() => setOpen(true)} placeholder="Matter number or name (optional)" aria-label="Matter" className={`${input} w-full`} />
      {open && list.length > 0 && (
        <>
          <ClickAway onClose={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 bg-white border border-line rounded-xl shadow-lg max-h-[220px] overflow-y-auto">
            {list.map((m) => (
              <button key={m.id} type="button" onClick={() => (onChange(m.id), setOpen(false), setQ(""))} className="w-full text-left flex gap-2 px-3 py-2 hover:bg-chip text-[13px]">
                {m.matterNumber && <span className="font-semibold flex-shrink-0">{m.matterNumber}</span>}
                <span className="truncate text-muted">{m.title}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Modal({ title, onClose, busy, children }: { title: string; onClose: () => void; busy: boolean; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [busy, onClose]);
  return (
    <div className="fixed inset-0 z-[60] bg-black/20 flex items-center justify-center px-4 py-6" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-[640px] max-h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 pb-6 text-[13.5px]">{children}</div>
      </div>
    </div>
  );
}

// Log a phone call; "Needs a call back" makes a task tagged to the matter.
function CallModal({ onClose, onSaved }: { onClose: () => void; onSaved: (msg: string) => void }) {
  const { teamMembers, meEmail, clients } = useWorkspaceData();
  const [f, setF] = useState({ direction: "in" as "in" | "out", contactName: "", contactPhone: "", matterId: "", subject: "", body: "", occurredAt: localNow(), durationMin: "" });
  // assignee null = me (who's signed in may load after the window opens); "" = unassigned.
  const [cb, setCb] = useState<{ needed: boolean; assignee: string | null; dueDate: string; priority: string }>({ needed: true, assignee: null, dueDate: new Date().toLocaleDateString("en-CA"), priority: "Medium" });
  const assignee = cb.assignee ?? meEmail ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  async function save() {
    setBusy(true);
    setError(null);
    try {
      const d = await fetch("/api/communications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "call", ...f, occurredAt: new Date(f.occurredAt).toISOString(), durationMin: f.durationMin ? Number(f.durationMin) : null, callback: { ...cb, assignee, needed: cb.needed } }),
      }).then(readJson);
      onSaved(d.item.taskId ? `Call logged. A call-back task was created${d.item.matter?.number ? ` on ${d.item.matter.number}` : ""}.` : "Call logged.");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal title="Log a phone call" onClose={onClose} busy={busy}>
      <div className="flex gap-2 mb-3">
        {(
          [
            ["in", PhoneIncoming, "Incoming"],
            ["out", PhoneOutgoing, "Outgoing"],
          ] as const
        ).map(([k, Icon, l]) => (
          <button key={k} type="button" onClick={() => (set({ direction: k }), setCb((c) => ({ ...c, needed: k === "in" })))} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium ${f.direction === k ? "bg-btn-hover" : "bg-chip hover:bg-btn"}`}>
            <Icon size={14} /> {l}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[12.5px] text-muted">{f.direction === "in" ? "Who called" : "Who you called"}</span>
          <input autoFocus value={f.contactName} onChange={(e) => set({ contactName: e.target.value })} list="comm-clients" placeholder="Name" className={input} />
          <datalist id="comm-clients">
            {clients.slice(0, 500).map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12.5px] text-muted">Phone</span>
          <input value={f.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} placeholder="(732) 555-0100" className={input} />
        </label>
        <div className="col-span-2 flex flex-col gap-1">
          <span className="text-[12.5px] text-muted">Matter</span>
          <MatterPicker value={f.matterId} onChange={(id) => set({ matterId: id })} />
        </div>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-[12.5px] text-muted">About</span>
          <input value={f.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="e.g. Question about the closing date" className={input} />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-[12.5px] text-muted">Notes / message</span>
          <textarea value={f.body} onChange={(e) => set({ body: e.target.value })} rows={3} placeholder="What they said, what they need" className={`${input} resize-y`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12.5px] text-muted">When</span>
          <input type="datetime-local" value={f.occurredAt} onChange={(e) => set({ occurredAt: e.target.value })} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12.5px] text-muted">Length (minutes)</span>
          <input type="number" min={0} value={f.durationMin} onChange={(e) => set({ durationMin: e.target.value })} placeholder="optional" className={input} />
        </label>
      </div>
      <div className={`mt-4 rounded-xl border px-4 py-3 ${cb.needed ? "border-btn bg-card-alt/60" : "border-line"}`}>
        <label className="flex items-center gap-2.5 cursor-pointer font-medium">
          <input type="checkbox" checked={cb.needed} onChange={(e) => setCb({ ...cb, needed: e.target.checked })} className="w-4 h-4 accent-[#5E6E8C]" />
          Needs a call back (creates a task)
        </label>
        {cb.needed && (
          <div className="grid grid-cols-3 gap-3 mt-3">
            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] text-muted">Who calls back</span>
              <select value={assignee} onChange={(e) => setCb({ ...cb, assignee: e.target.value })} className={input}>
                <option value="">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.email}>
                    {m.fullName || m.email}
                    {m.email === meEmail ? " (me)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] text-muted">By</span>
              <input type="date" value={cb.dueDate} onChange={(e) => setCb({ ...cb, dueDate: e.target.value })} className={input} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12.5px] text-muted">Priority</span>
              <select value={cb.priority} onChange={(e) => setCb({ ...cb, priority: e.target.value })} className={input}>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </label>
          </div>
        )}
      </div>
      {error && <div className="mt-3 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3">{error}</div>}
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} disabled={busy} className="px-4 py-2 rounded-full hover:bg-chip font-medium">
          Cancel
        </button>
        <button onClick={() => void save()} disabled={busy || (!f.contactName.trim() && !f.contactPhone.trim())} className="bg-btn hover:bg-btn-hover disabled:opacity-50 px-4 py-2 rounded-full font-medium flex items-center gap-2">
          {busy && <Loader2 size={14} className="animate-spin" />} Save call
        </button>
      </div>
    </Modal>
  );
}

function InternalModal({ onClose, onSaved }: { onClose: () => void; onSaved: (msg: string) => void }) {
  const { teamMembers, meEmail } = useWorkspaceData();
  const [to, setTo] = useState<string[]>([]);
  const [matterId, setMatterId] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send() {
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/communications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "internal", recipients: to, matterId, body }) }).then(readJson);
      onSaved(`Message sent to ${to.length} ${to.length === 1 ? "colleague" : "colleagues"}.`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal title="Internal message" onClose={onClose} busy={busy}>
      <div className="text-[12.5px] text-muted mb-1.5">To</div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {teamMembers
          .filter((m) => m.email !== meEmail)
          .map((m) => {
            const on = to.includes(m.id);
            return (
              <button key={m.id} type="button" onClick={() => setTo((t) => (on ? t.filter((x) => x !== m.id) : [...t, m.id]))} className={`px-3 py-1.5 rounded-full text-[13px] font-medium flex items-center gap-1 ${on ? "bg-btn-hover" : "bg-chip hover:bg-btn"}`}>
                {on && <Check size={12} />} {m.fullName || m.email}
              </button>
            );
          })}
      </div>
      <div className="text-[12.5px] text-muted mb-1.5">About a matter</div>
      <MatterPicker value={matterId} onChange={setMatterId} />
      <textarea autoFocus value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Write your message…" className={`${input} w-full mt-3 resize-y`} />
      <p className="text-[12px] text-muted mt-1.5">They get an alert (the bell). Messages stay inside the firm; clients never see them.</p>
      {error && <div className="mt-3 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3">{error}</div>}
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} disabled={busy} className="px-4 py-2 rounded-full hover:bg-chip font-medium">
          Cancel
        </button>
        <button onClick={() => void send()} disabled={busy || !to.length || !body.trim()} className="bg-btn hover:bg-btn-hover disabled:opacity-50 px-4 py-2 rounded-full font-medium flex items-center gap-2">
          {busy && <Loader2 size={14} className="animate-spin" />} Send
        </button>
      </div>
    </Modal>
  );
}

export default function CommunicationsPage() {
  const [view, setView] = useState<View>("calls");
  const [newOpen, setNewOpen] = useState(false);
  const [modal, setModal] = useState<"call" | "internal" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<{ view: View; items: unknown[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [callFilter, setCallFilter] = useState<"waiting" | "all">("waiting");
  const [q, setQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      const v = new URLSearchParams(window.location.search).get("view") as View | null;
      if (v && SECTIONS.some((s) => s.key === v)) setView(v);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const load = useCallback(async (v: View) => {
    if (v === "portals") return (await fetch("/api/portal-messages/recent").then(readJson)).messages ?? [];
    if (v === "meetings") {
      const from = new Date();
      const to = new Date(Date.now() + 30 * 86400_000);
      return (await fetch(`/api/calendar/events?${new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })}`).then(readJson)).events ?? [];
    }
    if (v === "emails" || v === "texts") return (await fetch(`/api/communications?view=${v}`).then(readJson)).messages ?? [];
    return (await fetch(`/api/communications?view=${v === "internal" ? "internal" : "calls"}`).then(readJson)).items ?? [];
  }, []);

  useEffect(() => {
    let live = true;
    load(view)
      .then((items) => live && (setData({ view, items }), setError(null)))
      .catch((e: Error) => live && (setData({ view, items: [] }), setError(e.message)));
    return () => {
      live = false;
    };
  }, [view, reload, load]);

  const items = data?.view === view ? data.items : null;
  const calls = useMemo(() => {
    if (view !== "calls" || !items) return [];
    const t = q.trim().toLowerCase();
    return (items as Comm[])
      .filter((c) => (callFilter === "waiting" ? c.callbackNeeded && !c.callbackDoneAt : true))
      .filter((c) => !t || `${c.contactName} ${c.contactPhone} ${c.subject} ${c.body} ${c.matter?.number ?? ""} ${c.matter?.title ?? ""}`.toLowerCase().includes(t));
  }, [items, view, callFilter, q]);
  const waitingCount = view === "calls" && items ? (items as Comm[]).filter((c) => c.callbackNeeded && !c.callbackDoneAt).length : 0;

  async function calledBack(c: Comm, done: boolean) {
    await fetch(`/api/communications/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ calledBack: done }) });
    setReload((r) => r + 1);
  }
  async function remove(c: Comm) {
    if (!confirm("Delete this call log? A call-back task it created stays on the Task Board.")) return;
    await fetch(`/api/communications/${c.id}`, { method: "DELETE" });
    setReload((r) => r + 1);
  }
  const saved = (msg: string, v: View) => {
    setModal(null);
    setNotice(msg);
    setView(v);
    setReload((r) => r + 1);
    setTimeout(() => setNotice(null), 6000);
  };

  const empty = (text: string, extra?: React.ReactNode) => (
    <div className="py-16 text-center text-muted text-[14px]">
      {text}
      {extra && <div className="mt-3">{extra}</div>}
    </div>
  );

  return (
    <div className="px-10 py-10 max-w-[1400px] min-w-0">
      <div className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] gap-6 items-start">
        <aside>
          <h1 className="text-[26px] font-semibold mb-4">Communications</h1>
          <div className="relative mb-5">
            <button onClick={() => setNewOpen((o) => !o)} className="bg-[#1B191A] text-white hover:opacity-90 px-4 py-2.5 rounded-full text-[14px] font-semibold flex items-center gap-2">
              <Plus size={15} /> New <ChevronDown size={14} />
            </button>
            {newOpen && (
              <>
                <ClickAway onClose={() => setNewOpen(false)} />
                <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[250px] bg-white border border-line rounded-2xl shadow-[0_12px_32px_rgba(27,25,26,0.12)] p-1.5">
                  {[
                    { icon: Phone, label: "Phone call", sub: "Log it; add a call-back task", go: () => setModal("call") },
                    { icon: MessagesSquare, label: "Internal message", sub: "To colleagues, about a matter", go: () => setModal("internal") },
                    { icon: Mail, label: "Email", sub: "Write it in the Inbox", href: "/dashboard/inbox" },
                    { icon: Mic, label: "Meeting", sub: "Add it in the Calendar", href: "/dashboard/calendar" },
                  ].map((o) =>
                    o.href ? (
                      <Link key={o.label} href={o.href} className="flex items-start gap-2.5 px-3 py-2 rounded-xl hover:bg-chip">
                        <o.icon size={15} className="mt-0.5 text-muted" />
                        <span>
                          <span className="block text-[13.5px] font-medium">{o.label}</span>
                          <span className="block text-[12px] text-muted">{o.sub}</span>
                        </span>
                      </Link>
                    ) : (
                      <button key={o.label} onClick={() => (setNewOpen(false), o.go?.())} className="w-full text-left flex items-start gap-2.5 px-3 py-2 rounded-xl hover:bg-chip">
                        <o.icon size={15} className="mt-0.5 text-muted" />
                        <span>
                          <span className="block text-[13.5px] font-medium">{o.label}</span>
                          <span className="block text-[12px] text-muted">{o.sub}</span>
                        </span>
                      </button>
                    )
                  )}
                </div>
              </>
            )}
          </div>
          <nav className="flex flex-col gap-0.5">
            {SECTIONS.map((s) => (
              <button key={s.key} onClick={() => setView(s.key)} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-medium text-left transition-colors ${view === s.key ? "bg-nav text-ink" : "text-muted hover:bg-nav hover:text-ink"}`}>
                <s.icon size={16} strokeWidth={1.75} />
                <span className="flex-1">{s.label}</span>
                {s.key === "calls" && waitingCount > 0 && <span className="text-[11px] font-semibold bg-[#FB5D67] text-white rounded-full px-1.5 py-px">{waitingCount}</span>}
              </button>
            ))}
          </nav>
        </aside>

        <section className="bg-card-alt rounded-2xl p-5 min-h-[520px] min-w-0 overflow-hidden">
          {notice && (
            <div className="mb-4 rounded-xl bg-[#E7F6EE] text-[#155C3A] px-4 py-2.5 text-[13.5px] flex items-center gap-2">
              <Check size={15} /> {notice}
            </div>
          )}
          {error && <div className="mb-4 rounded-xl bg-[#FFF8EE] border border-[#F6D4A6] px-4 py-3 text-[13.5px]">{error}</div>}

          {view === "calls" && (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {(
                  [
                    ["waiting", `Needs a call back${waitingCount ? ` (${waitingCount})` : ""}`],
                    ["all", "All calls"],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} onClick={() => setCallFilter(k)} className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium ${callFilter === k ? "bg-btn-hover" : "bg-white hover:bg-btn"}`}>
                    {l}
                  </button>
                ))}
                <div className="flex items-center gap-2 bg-white rounded-full px-3 py-1.5 ml-auto w-[260px]">
                  <Search size={13} className="text-muted" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or matter number" aria-label="Search calls" className="flex-1 min-w-0 bg-transparent outline-none text-[13px]" />
                </div>
                <button onClick={() => setModal("call")} className="bg-btn hover:bg-btn-hover px-4 py-1.5 rounded-full text-[13px] font-medium flex items-center gap-1.5">
                  <Phone size={13} /> Log a call
                </button>
              </div>
              {!items ? (
                <div className="flex items-center gap-2 text-muted text-[13.5px]">
                  <Loader2 size={14} className="animate-spin" /> Loading…
                </div>
              ) : calls.length === 0 ? (
                empty(callFilter === "waiting" ? "No calls waiting for a call back." : "No calls logged yet.", <button onClick={() => setModal("call")} className="bg-white hover:bg-btn px-4 py-2 rounded-full text-[13px] font-medium text-ink">Log a call</button>)
              ) : (
                <div className="flex flex-col gap-2">
                  {calls.map((c) => {
                    const waiting = c.callbackNeeded && !c.callbackDoneAt;
                    return (
                      <div key={c.id} className={`group bg-white rounded-xl px-4 py-3 flex items-start gap-3 min-w-0 overflow-hidden ${waiting ? "border-l-[6px] border-[#FB5D67]" : ""}`}>
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${c.direction === "in" ? "bg-[#EEF3FB] text-[#2B6CB0]" : "bg-chip text-muted"}`} title={c.direction === "in" ? "Incoming" : "Outgoing"}>
                          {c.direction === "in" ? <PhoneIncoming size={15} /> : <PhoneOutgoing size={15} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-[14px]">{c.contactName || c.contactPhone}</span>
                            {c.contactPhone && c.contactName && (
                              <a href={`tel:${c.contactPhone}`} className="text-[13px] text-[#2B6CB0] hover:underline">
                                {c.contactPhone}
                              </a>
                            )}
                            <MatterBadge m={c.matter} />
                          </div>
                          {(c.subject || c.body) && <div className="text-[13px] text-muted mt-0.5 whitespace-pre-line [overflow-wrap:anywhere]">{[c.subject, c.body].filter(Boolean).join(": ")}</div>}
                          <div className="text-[12px] text-muted mt-1">
                            {when(c.occurredAt)}
                            {c.durationMin ? ` · ${c.durationMin} min` : ""}
                            {c.createdBy ? ` · logged by ${c.createdBy.name}` : ""}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          {waiting ? (
                            <button onClick={() => void calledBack(c, true)} className="flex items-center gap-1.5 bg-[#1B191A] text-white px-3 py-1.5 rounded-full text-[12.5px] font-semibold hover:opacity-90">
                              <Check size={13} /> Called back
                            </button>
                          ) : c.callbackDoneAt ? (
                            <button onClick={() => void calledBack(c, false)} title="Undo" className="text-[12px] text-[#155C3A] bg-[#E7F6EE] rounded-full px-2.5 py-1">
                              Called back {when(c.callbackDoneAt)}
                            </button>
                          ) : null}
                          {c.taskId && (
                            <Link href={`/dashboard/task-board?task=${c.taskId}`} className="text-[12px] text-muted hover:text-ink flex items-center gap-1">
                              <ListChecks size={12} /> Open task
                            </Link>
                          )}
                          <button onClick={() => void remove(c)} aria-label="Delete call log" className="opacity-0 group-hover:opacity-100 text-muted hover:text-[#B42318]">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {view === "portals" &&
            (!items ? (
              <Loader2 size={14} className="animate-spin text-muted" />
            ) : !items.length ? (
              empty("No client portal messages in the last 30 days.")
            ) : (
              <div className="flex flex-col gap-2">
                {(items as { id: string; from: string; clientId: string; matterId: string | null; matter: string | null; preview: string; unread: boolean; at: string }[]).map((m) => (
                  <Link key={m.id} href={m.matterId ? `/dashboard/matters/${m.matterId}?tab=emails` : `/dashboard/client-intake?card=${m.clientId}`} className="bg-white rounded-xl px-4 py-3 hover:bg-chip/40 block min-w-0 overflow-hidden">
                    <div className="flex items-center gap-2 min-w-0">
                      {m.unread && <span className="w-2 h-2 rounded-full bg-[#3B82F6]" />}
                      <span className="font-semibold text-[14px]">{m.from}</span>
                      {m.matter && <span className="text-[11.5px] font-semibold bg-[#E1E7F4] rounded-md px-1.5 py-px">{m.matter}</span>}
                      <span className="ml-auto text-[12px] text-muted">{when(m.at)}</span>
                    </div>
                    <div className="text-[13px] text-muted mt-0.5 whitespace-pre-line [overflow-wrap:anywhere]">{m.preview}</div>
                  </Link>
                ))}
              </div>
            ))}

          {(view === "emails" || view === "texts") &&
            (!items ? (
              <Loader2 size={14} className="animate-spin text-muted" />
            ) : !items.length ? (
              view === "emails"
                ? empty("No emails filed to matters yet. In the Inbox, open an email and click File to matter.", <Link href="/dashboard/inbox" className="bg-white hover:bg-btn px-4 py-2 rounded-full text-[13px] font-medium text-ink">Open the Inbox</Link>)
                : empty("No text messages yet. Texting clients from LawPower needs a phone provider such as RingCentral; ask to have it connected.")
            ) : (
              <div className="flex flex-col gap-2">
                {(items as { id: string; direction: "in" | "out"; subject: string; from: string; to: string; at: string; snippet: string; matter: MatterRef }[]).map((m) => (
                  <div key={m.id} className="bg-white rounded-xl px-4 py-3 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[14px] truncate min-w-0">{m.direction === "out" ? `To ${m.to}` : m.from}</span>
                      <MatterBadge m={m.matter} />
                      <span className="ml-auto text-[12px] text-muted flex-shrink-0">{when(m.at)}</span>
                      {m.matter && (
                        <Link href={`/dashboard/matters/${m.matter.id}?tab=emails`} className="text-[12px] font-medium underline underline-offset-2 text-muted hover:text-ink flex-shrink-0">
                          Open
                        </Link>
                      )}
                    </div>
                    {m.subject && <div className="text-[13px] font-medium mt-0.5 [overflow-wrap:anywhere]">{m.subject}</div>}
                    <div className="text-[13px] text-muted mt-0.5 whitespace-pre-line [overflow-wrap:anywhere]">{m.snippet}</div>
                  </div>
                ))}
              </div>
            ))}

          {view === "meetings" &&
            (!items ? (
              <Loader2 size={14} className="animate-spin text-muted" />
            ) : !items.length ? (
              empty("No meetings in the next 30 days.", <Link href="/dashboard/calendar" className="bg-white hover:bg-btn px-4 py-2 rounded-full text-[13px] font-medium text-ink">Open the Calendar</Link>)
            ) : (
              <div className="flex flex-col gap-2">
                {(items as { id: string; title: string; start: string; allDay: boolean; location: string | null; link: string | null }[]).map((e) => (
                  <div key={e.id} className="bg-white rounded-xl px-4 py-3 flex items-center gap-3 min-w-0 overflow-hidden">
                    <div className="w-[120px] flex-shrink-0 text-[13px] font-semibold">
                      {e.allDay ? new Date(`${e.start.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : when(e.start)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-[14px] [overflow-wrap:anywhere]">{e.title}</div>
                      {e.location && <div className="text-[12.5px] text-muted [overflow-wrap:anywhere]">{e.location}</div>}
                    </div>
                    {e.link && (
                      <a href={e.link} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-muted hover:text-ink underline underline-offset-2 flex-shrink-0">
                        Open
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ))}

          {view === "internal" && (
            <>
              <div className="flex justify-end mb-4">
                <button onClick={() => setModal("internal")} className="bg-btn hover:bg-btn-hover px-4 py-1.5 rounded-full text-[13px] font-medium flex items-center gap-1.5">
                  <Plus size={13} /> New message
                </button>
              </div>
              {!items ? (
                <Loader2 size={14} className="animate-spin text-muted" />
              ) : !items.length ? (
                empty("No internal messages yet.")
              ) : (
                <div className="flex flex-col gap-2">
                  {(items as Comm[]).map((m) => (
                    <div key={m.id} className="bg-white rounded-xl px-4 py-3 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[14px]">{m.createdBy?.name ?? "Someone"}</span>
                        <span className="text-[12.5px] text-muted">to {m.recipients.map((r) => r.name).join(", ")}</span>
                        <MatterBadge m={m.matter} />
                        <span className="ml-auto text-[12px] text-muted">{when(m.occurredAt)}</span>
                      </div>
                      <div className="text-[13.5px] mt-1 whitespace-pre-line [overflow-wrap:anywhere]">{m.body}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
      {modal === "call" && <CallModal onClose={() => setModal(null)} onSaved={(m) => saved(m, "calls")} />}
      {modal === "internal" && <InternalModal onClose={() => setModal(null)} onSaved={(m) => saved(m, "internal")} />}
    </div>
  );
}
