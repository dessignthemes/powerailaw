"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Upload, FileText, Trash2, Plus, ShieldCheck, Search, Check } from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import type { Matter } from "@/components/NewMatterModal";
import { useTemplates } from "@/components/templates/useTemplates";
import { templatesFor } from "@/components/matters/MatterTasks";
import { applyTemplate, nextStep } from "@/lib/checklist";
import { boardForMatter } from "@/lib/matters/boards";
import { uploadNewDocument } from "@/lib/pdf/upload";

// The New matter window: the basics (type, number, title, client…) followed by
// sections like Matter details, Related contacts, Billing, Task lists, Documents
// and Conflict check, with a section list on the left. Everything is saved in
// one go; then it opens the new matter (or the conflict check result).

type ContactRow = { key: string; kind: "client" | "contact"; id: string; name: string; sub: string; role: string };
type ContactLite = { id: string; name: string; company?: string; email?: string | null; role?: string };

const SECTIONS = [
  ["basics", "Basics"],
  ["details", "Matter details"],
  ["contacts", "Related contacts"],
  ["billing", "Billing"],
  ["tasks", "Task lists"],
  ["documents", "Documents & auto-fill"],
  ["conflict", "Conflict check"],
] as const;
type SectionId = (typeof SECTIONS)[number][0];

const MAX_FILES = 5;
const today = () => new Date().toLocaleDateString("en-CA");

export default function MatterCreateWindow({
  basics,
  canSave,
  buildMatter,
  onClose,
}: {
  basics: React.ReactNode;
  canSave: boolean;
  buildMatter: () => Matter;
  onClose: () => void;
}) {
  const router = useRouter();
  const { teamMembers, clients, boards, addMatterAsync, addTask, meEmail } = useWorkspaceData();
  const { templates } = useTemplates();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<SectionId>("basics");

  // Matter details
  const [responsible, setResponsible] = useState<string>(meEmail ?? ""); // email (the matter's "Assigned to")
  const [originating, setOriginating] = useState<string>(""); // profile id
  const [staff, setStaff] = useState<string>(""); // profile id
  const [clientRef, setClientRef] = useState("");
  const [location, setLocation] = useState("");
  const [openDate, setOpenDate] = useState(today());
  const [pendingDate, setPendingDate] = useState("");
  const [closedDate, setClosedDate] = useState("");
  const [solDate, setSolDate] = useState("");
  const [solSatisfied, setSolSatisfied] = useState(false);
  // Billing
  const [trustMin, setTrustMin] = useState("");
  // Related contacts
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [contactList, setContactList] = useState<ContactLite[]>([]);
  const [pickQ, setPickQ] = useState("");
  // Task lists
  const [chosen, setChosen] = useState<string[]>([]);
  const [boardId, setBoardId] = useState<string | null | undefined>(undefined); // undefined = the matter's own board
  // Documents
  const [files, setFiles] = useState<File[]>([]);
  const [autofill, setAutofill] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  // Saving
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ matter: Matter; warnings: string[]; conflictId: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/contacts")
      .then((r) => (r.ok ? r.json() : { contacts: [] }))
      .then((d: { contacts?: ContactLite[] }) => setContactList(d.contacts ?? []))
      .catch(() => undefined);
  }, []);

  const draft = buildMatter();
  const ownBoard = boardForMatter(boards, { matterCode: draft.matterCode ?? null, matterNumber: draft.matterNumber ?? null, category: draft.category ?? null } as Matter);
  const board = boardId === undefined ? ownBoard : boardId;
  const { suggested, others } = templatesFor(templates ?? [], draft.matterCode);

  // Which section is on screen.
  const onScroll = () => {
    const box = scrollRef.current;
    if (!box) return;
    const top = box.getBoundingClientRect().top + 24;
    let current: SectionId = "basics";
    for (const [id] of SECTIONS) {
      const el = box.querySelector(`[data-section="${id}"]`);
      if (el && el.getBoundingClientRect().top <= top) current = id;
    }
    setActive(current);
  };
  const go = (id: SectionId) => scrollRef.current?.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const people = teamMembers.filter((m) => m.email);
  const pickResults = useMemo(() => {
    const words = pickQ.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const has = (t: string) => words.every((w) => t.toLowerCase().includes(w));
    const taken = new Set(rows.map((r) => r.key));
    const out: ContactRow[] = [];
    for (const c of clients) if (has(`${c.name} ${c.email ?? ""}`) && !taken.has(`client:${c.id}`)) out.push({ key: `client:${c.id}`, kind: "client", id: c.id, name: c.name, sub: ["Client", c.email].filter(Boolean).join(" · "), role: "" });
    for (const c of contactList) if (has(`${c.name} ${c.company ?? ""} ${c.email ?? ""}`) && !taken.has(`contact:${c.id}`)) out.push({ key: `contact:${c.id}`, kind: "contact", id: c.id, name: c.name, sub: [c.role || "Contact", c.company, c.email].filter(Boolean).join(" · "), role: c.role ?? "" });
    return out.slice(0, 8);
  }, [pickQ, clients, contactList, rows]);

  function addFiles(list: FileList | File[]) {
    const ok = Array.from(list).filter((f) => /\.(pdf|docx?|png|jpe?g|tiff?)$/i.test(f.name) && f.size <= 25 * 1024 * 1024);
    setFiles((fs) => [...fs, ...ok].slice(0, MAX_FILES));
  }

  async function save(runConflict: boolean) {
    if (!canSave || busy) return;
    setError(null);
    const warnings: string[] = [];
    let saved: Matter;
    try {
      setBusy("Creating the matter…");
      const m = buildMatter();
      saved = await addMatterAsync({ ...m, assignedTo: responsible || m.assignedTo || null });
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
      return;
    }

    // Matter details (needs migration 0063).
    const info = { originatingAttorney: originating || null, responsibleStaff: staff || null, clientReference: clientRef, location, openDate: openDate || null, pendingDate: pendingDate || null, closedDate: closedDate || null, solDate: solDate || null, solSatisfied, trustMinimum: trustMin === "" ? null : Number(trustMin) };
    const anyInfo = originating || staff || clientRef.trim() || location.trim() || openDate || pendingDate || closedDate || solDate || trustMin;
    if (anyInfo) {
      setBusy("Saving the matter details…");
      const r = await fetch(`/api/matters/${saved.id}/info`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(info) }).catch(() => null);
      if (!r || !r.ok) warnings.push(((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? "The matter details (dates, reference, location) weren't saved.");
    }

    // Related contacts.
    if (rows.length) {
      setBusy("Adding the contacts…");
      for (const row of rows) {
        const r = await fetch(`/api/matters/${saved.id}/contacts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(row.kind === "client" ? { clientId: row.id, role: row.role } : { contactId: row.id, role: row.role }) }).catch(() => null);
        if (!r || !r.ok) warnings.push(`${row.name} wasn't added to the matter's contacts.`);
      }
    }

    // Task lists: one task per template, on the chosen board.
    for (const id of chosen) {
      const t = (templates ?? []).find((x) => x.id === id);
      if (!t) continue;
      const checklist = applyTemplate(null, t);
      addTask({
        id: crypto.randomUUID(),
        title: `${t.name}: ${saved.matterNumber ?? saved.title}`,
        description: saved.matterNumber ? `Matter ${saved.matterNumber} · ${saved.title}` : `Matter: ${saved.title}`,
        status: "todo",
        priority: "Medium",
        assignee: responsible || null,
        dueDate: nextStep(checklist)?.due || null,
        comments: [],
        boardId: board ?? null,
        matterId: saved.id,
        checklist,
        createdAt: new Date().toISOString(),
      });
    }

    // Documents, then read them to fill in the details and key dates.
    if (files.length) {
      for (let i = 0; i < files.length; i++) {
        setBusy(`Uploading documents (${i + 1} of ${files.length})…`);
        try {
          await uploadNewDocument(saved.id, files[i]);
        } catch {
          warnings.push(`${files[i].name} wasn't uploaded.`);
        }
      }
      if (autofill && files.length > warnings.filter((w) => w.endsWith("wasn't uploaded.")).length) {
        // Reading takes a minute; it carries on while the matter opens.
        void fetch(`/api/matters/${saved.id}/key-dates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh" }), keepalive: true }).catch(() => undefined);
      }
    }

    // Conflict check on the client.
    let conflictId: string | null = null;
    if (runConflict && saved.clientId) {
      setBusy("Running the conflict check…");
      const r = await fetch("/api/conflicts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: saved.clientId }) }).catch(() => null);
      const d = (await r?.json().catch(() => ({}))) as { check?: { id: string }; error?: string } | undefined;
      if (r?.ok && d?.check) conflictId = d.check.id;
      else warnings.push(d?.error ?? "The conflict check couldn't be run. Run it from the client card.");
    }

    setBusy(null);
    if (warnings.length) {
      setDone({ matter: saved, warnings, conflictId });
      return;
    }
    onClose();
    router.push(conflictId ? `/dashboard/conflict-checks?check=${conflictId}` : `/dashboard/matters/${saved.id}`);
  }

  const label = "block text-[12.5px] font-semibold text-muted mb-1";
  const input = "w-full bg-white border border-line rounded-xl px-3 py-2 text-[13.5px] outline-none focus:border-btn-ring";
  const card = "bg-white/70 border border-line rounded-2xl p-5 scroll-mt-4";
  const title = (t: string, sub?: string) => (
    <div className="mb-4">
      <h3 className="text-[16px] font-semibold">{t}</h3>
      {sub && <p className="text-[12.5px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
  const personSelect = (value: string, set: (v: string) => void, byEmail = false, aria = "") => (
    <select value={value} onChange={(e) => set(e.target.value)} aria-label={aria} className={input}>
      <option value="">—</option>
      {people.map((p) => (
        <option key={p.id} value={byEmail ? p.email : p.id}>
          {p.fullName || p.email}
        </option>
      ))}
    </select>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4 py-6" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-label="New matter" className="bg-cream rounded-3xl w-full max-w-[1120px] h-full max-h-[92vh] flex flex-col shadow-[0_30px_80px_-20px_rgba(18,17,16,0.35)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-line">
          <h2 className="text-[18px] font-semibold flex-1">New matter</h2>
          <button onClick={onClose} disabled={!!busy} className="px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-chip disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={() => void save(true)}
            disabled={!canSave || !!busy || !draft.clientId}
            title={draft.clientId ? "Save, then check the client against every matter" : "Pick the client first"}
            className="px-4 py-2 rounded-full text-[13.5px] font-medium bg-chip hover:bg-btn disabled:opacity-50 flex items-center gap-1.5"
          >
            <ShieldCheck size={14} /> Save and run conflict check
          </button>
          <button onClick={() => void save(false)} disabled={!canSave || !!busy} className="px-5 py-2 rounded-full text-[13.5px] font-semibold bg-btn hover:bg-btn-hover disabled:opacity-50 flex items-center gap-1.5">
            {busy && <Loader2 size={14} className="animate-spin" />} Save
          </button>
          <button onClick={onClose} disabled={!!busy} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center text-muted">
            <X size={17} />
          </button>
        </div>
        {(busy || error) && (
          <div className={`px-6 py-2 text-[13px] ${error ? "bg-[#FDECEC] text-[#9F1D1D]" : "bg-[#EEF3FB] text-ink"}`}>{error ?? busy}</div>
        )}

        {done ? (
          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-[560px] mx-auto">
              <div className="flex items-center gap-2 text-[18px] font-semibold mb-2">
                <Check size={20} className="text-[#00A35F]" /> {done.matter.matterNumber ?? done.matter.title} was created
              </div>
              <p className="text-[13.5px] text-muted mb-3">A few things didn&apos;t go through:</p>
              <ul className="list-disc pl-5 text-[13.5px] mb-5 space-y-1">
                {done.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    onClose();
                    router.push(`/dashboard/matters/${done.matter.id}`);
                  }}
                  className="bg-btn hover:bg-btn-hover px-4 py-2 rounded-full text-[13.5px] font-medium"
                >
                  Open the matter
                </button>
                {done.conflictId && (
                  <button
                    onClick={() => {
                      onClose();
                      router.push(`/dashboard/conflict-checks?check=${done.conflictId}`);
                    }}
                    className="bg-chip hover:bg-btn px-4 py-2 rounded-full text-[13.5px] font-medium"
                  >
                    See the conflict check
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex min-h-0">
            {/* Sections */}
            <nav className="hidden md:flex flex-col w-[200px] flex-shrink-0 border-r border-line px-3 py-5 gap-0.5" aria-label="Sections">
              <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Sections</div>
              {SECTIONS.map(([id, name]) => (
                <button key={id} onClick={() => go(id)} className={`text-left px-3 py-1.5 rounded-lg text-[13.5px] ${active === id ? "bg-chip font-semibold text-ink" : "text-muted hover:text-ink hover:bg-chip/60"}`}>
                  {name}
                </button>
              ))}
            </nav>

            <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
              <section data-section="basics" className={`${card} !p-0 overflow-visible`}>
                <div className="px-7 pt-5">{title("Basics", "Matter type, number, title and client.")}</div>
                <div className="-mt-3 pb-4">{basics}</div>
              </section>

              <section data-section="details" className={card}>
                {title("Matter details")}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  <label>
                    <span className={label}>Responsible attorney</span>
                    {personSelect(responsible, setResponsible, true, "Responsible attorney")}
                  </label>
                  <label>
                    <span className={label}>Originating attorney</span>
                    {personSelect(originating, setOriginating, false, "Originating attorney")}
                  </label>
                  <label>
                    <span className={label}>Responsible staff</span>
                    {personSelect(staff, setStaff, false, "Responsible staff")}
                  </label>
                  <label>
                    <span className={label}>Client reference number</span>
                    <input value={clientRef} onChange={(e) => setClientRef(e.target.value)} placeholder="Optional" className={input} maxLength={100} />
                  </label>
                  <label className="sm:col-span-2">
                    <span className={label}>Location</span>
                    <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. property address, court or county" className={input} maxLength={200} />
                  </label>
                  <label>
                    <span className={label}>Open date</span>
                    <input type="date" value={openDate} onChange={(e) => setOpenDate(e.target.value)} className={input} />
                  </label>
                  <label>
                    <span className={label}>Pending date</span>
                    <input type="date" value={pendingDate} onChange={(e) => setPendingDate(e.target.value)} className={input} />
                  </label>
                  <label>
                    <span className={label}>Closed date</span>
                    <input type="date" value={closedDate} onChange={(e) => setClosedDate(e.target.value)} className={input} />
                  </label>
                  <div>
                    <span className={label}>Statute of limitations</span>
                    <div className="flex items-center gap-3">
                      <input type="date" value={solDate} onChange={(e) => setSolDate(e.target.value)} aria-label="Statute of limitations date" className={input} />
                      <label className="flex items-center gap-1.5 text-[12.5px] whitespace-nowrap cursor-pointer">
                        <input type="checkbox" checked={solSatisfied} onChange={(e) => setSolSatisfied(e.target.checked)} className="w-4 h-4 accent-[#5E6E8C]" /> Satisfied
                      </label>
                    </div>
                  </div>
                </div>
              </section>

              <section data-section="contacts" className={card}>
                {title("Related contacts", "The other side, realtors, attorneys, lenders… with their role on this matter.")}
                {rows.length > 0 && (
                  <div className="flex flex-col gap-2 mb-3">
                    {rows.map((r) => (
                      <div key={r.key} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0 bg-white border border-line rounded-xl px-3 py-2">
                          <div className="text-[13.5px] font-medium truncate">{r.name}</div>
                          <div className="text-[12px] text-muted truncate">{r.sub}</div>
                        </div>
                        <input
                          value={r.role}
                          onChange={(e) => setRows((list) => list.map((x) => (x.key === r.key ? { ...x, role: e.target.value } : x)))}
                          placeholder="Role, e.g. Seller's attorney"
                          aria-label={`Role of ${r.name}`}
                          className={`${input} w-[230px]`}
                          maxLength={80}
                        />
                        <button onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))} aria-label={`Remove ${r.name}`} className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center text-muted">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input value={pickQ} onChange={(e) => setPickQ(e.target.value)} placeholder="Search clients and contacts to add" aria-label="Find a contact" className={`${input} pl-8`} />
                  {pickResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 bg-white border border-line rounded-xl shadow-lg p-1 max-h-[240px] overflow-y-auto">
                      {pickResults.map((p) => (
                        <button
                          key={p.key}
                          onClick={() => {
                            setRows((list) => [...list, p]);
                            setPickQ("");
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-chip flex items-center gap-2"
                        >
                          <Plus size={13} className="text-muted" />
                          <span className="min-w-0">
                            <span className="block text-[13.5px] font-medium truncate">{p.name}</span>
                            <span className="block text-[12px] text-muted truncate">{p.sub}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section data-section="billing" className={card}>
                {title("Billing", "Billing type and rate are in Basics above.")}
                <label className="block max-w-[320px]">
                  <span className={label}>Trust balance: minimum required</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted">$</span>
                    <input value={trustMin} onChange={(e) => setTrustMin(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="0.00" className={input} />
                  </div>
                </label>
              </section>

              <section data-section="tasks" className={card}>
                {title("Task lists", "Each template you pick becomes a task with its checklist, linked to this matter.")}
                {templates === null ? (
                  <div className="text-[13px] text-muted flex items-center gap-2">
                    <Loader2 size={13} className="animate-spin" /> Loading templates…
                  </div>
                ) : !templates.length ? (
                  <div className="text-[13px] text-muted">No task templates yet. Make them under AI Templates.</div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {[...suggested, ...others].map((t) => {
                        const on = chosen.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            onClick={() => setChosen((c) => (on ? c.filter((x) => x !== t.id) : [...c, t.id]))}
                            aria-pressed={on}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium border ${on ? "bg-btn-hover border-transparent" : "bg-white border-line hover:bg-chip"}`}
                          >
                            {on && <Check size={12} />} {t.name}
                            {suggested.includes(t) && <span className="text-[11px] text-muted font-normal">suggested</span>}
                          </button>
                        );
                      })}
                    </div>
                    {chosen.length > 0 && (
                      <label className="flex items-center gap-2 text-[13px]">
                        <span className="text-muted">Put them on</span>
                        <select value={board ?? ""} onChange={(e) => setBoardId(e.target.value || null)} className={`${input} w-auto`}>
                          <option value="">General</option>
                          {boards.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                        <span className="text-muted">assigned to the responsible attorney</span>
                      </label>
                    )}
                  </>
                )}
              </section>

              <section data-section="documents" className={card}>
                {title("Documents & auto-fill", "Upload the contract, review letters or other papers. They're saved to the matter, and the AI can fill in its details and key dates from them.")}
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    addFiles(e.dataTransfer.files);
                  }}
                  className="border border-dashed border-btn-ring rounded-2xl px-4 py-6 text-center bg-white/60"
                >
                  <Upload size={18} className="mx-auto mb-1.5 text-muted" />
                  <div className="text-[13.5px] font-medium">Drag and drop files here</div>
                  <div className="text-[12.5px] text-muted">
                    or{" "}
                    <button onClick={() => fileRef.current?.click()} className="underline underline-offset-2 text-ink">
                      browse files
                    </button>{" "}
                    · PDF, Word or images · up to {MAX_FILES} files
                  </div>
                  <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.tif,.tiff" className="hidden" onChange={(e) => (e.target.files && addFiles(e.target.files), (e.target.value = ""))} />
                </div>
                {files.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1.5">
                    {files.map((f, i) => (
                      <div key={`${f.name}-${i}`} className="flex items-center gap-2 bg-white border border-line rounded-xl px-3 py-2 text-[13px]">
                        <FileText size={14} className="text-muted" />
                        <span className="flex-1 truncate">{f.name}</span>
                        <span className="text-muted text-[12px]">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                        <button onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="text-muted hover:text-[#B42318]">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                    <label className="flex items-center gap-2 text-[13px] mt-1 cursor-pointer">
                      <input type="checkbox" checked={autofill} onChange={(e) => setAutofill(e.target.checked)} className="w-4 h-4 accent-[#5E6E8C]" />
                      Fill in the matter&apos;s details and key dates from these documents (uses AI credits)
                    </label>
                  </div>
                )}
              </section>

              <section data-section="conflict" className={card}>
                {title("Conflict check")}
                <p className="text-[13px] text-muted">
                  Click <b className="text-ink font-medium">Save and run conflict check</b> at the top to save the matter and check {draft.clientId ? "the client" : "its client (pick one in Basics first)"} against every matter: leads, open and closed. The result opens right after.
                </p>
              </section>
              <div className="h-[30vh] flex-shrink-0" aria-hidden />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
