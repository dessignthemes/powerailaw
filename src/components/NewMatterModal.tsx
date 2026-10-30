"use client";

import PortalButton from "@/components/clientCard/PortalButton";
import { useEffect, useState } from "react";
import MatterCreateWindow from "@/components/matters/MatterCreateWindow";
import {
  X,
  Check,
  Briefcase,
  Circle,
  CircleDot,
  CircleDashed,
  Disc,
  CheckCircle2,
  UserPlus,
  CalendarDays,
  Tag,
  Handshake,
  TriangleAlert,
  DollarSign,
  Link2,
  Search,
} from "lucide-react";
import { GenericDropdown } from "@/components/NewTaskModal";
import { Client, getInitials, getAvatarColor } from "@/components/NewClientModal";
import { SUGGESTED_CODES, cleanCode, isValidCode, formatMatterNumber, NUMBER_PATTERN, cleanNumber } from "@/lib/matters/numbering";

// Alphabetical by name, ignoring titles ("Mr. Adam Nowak" sorts under A).
const sortName = (n: string) => n.replace(/^(mr|mrs|ms|miss|dr|prof|hon|rev)\.?\s+/i, "").trim().toLowerCase();

// Matter types shown first when creating a matter.
const MAIN_TYPES: MatterCategory[] = ["Real Estate", "Litigation", "Estate Planning"];

export type MatterStatus = "Lead" | "Consultation" | "Engaged" | "Active" | "Closed";
export type MatterCategory =
  | "None"
  | "Litigation"
  | "Family Law"
  | "Immigration"
  | "Personal Injury"
  | "Criminal Defense"
  | "Estate Planning"
  | "Probate"
  | "Real Estate"
  | "Business / Corporate";
export type BillingType = "Hourly" | "Flat fee";

export type Matter = {
  id: string;
  title: string;
  description: string;
  status: MatterStatus;
  clientId: string | null;
  dueDate: string | null;
  category: MatterCategory | null;
  counterparty: string | null;
  blocker: string | null;
  value: number | null;
  billingType: BillingType;
  hourlyRate: number | null;
  assignedTo: string | null;
  privateNotes: string;
  // Matter number, e.g. REP-2026-0001. The code is picked by the firm; the
  // number is given by the database when the matter is saved.
  matterCode?: string | null;
  matterNumber?: string | null;
  matterSeq?: number | null;
  createdAt: string;
  updatedAt: string;
};

// The matter's number: its own, or one written in its title (matters brought over from LEAP).
export function numberOf(m: Pick<Matter, "title" | "matterNumber">): string | null {
  return m.matterNumber ?? (m.title.toUpperCase().match(/\b[A-Z][A-Z0-9]{1,5}-\d{4}-\d{4,}\b/)?.[0] ?? null);
}

// "REP-2026-0001 · Smith purchase" (or just the title before a number exists).
export function matterLabel(m: Pick<Matter, "title" | "matterNumber">): string {
  return m.matterNumber ? `${m.matterNumber} · ${m.title}` : m.title;
}

export const matterStatusOrder: MatterStatus[] = ["Lead", "Consultation", "Engaged", "Active", "Closed"];

export const matterStatusMeta: Record<MatterStatus, { icon: typeof Circle; color: string }> = {
  Lead: { icon: CircleDashed, color: "text-muted" },
  Consultation: { icon: Circle, color: "text-blue-500" },
  Engaged: { icon: CircleDot, color: "text-amber-500" },
  Active: { icon: Disc, color: "text-amber-700" },
  Closed: { icon: CheckCircle2, color: "text-green-600" },
};

export const matterCategories: MatterCategory[] = [
  "None",
  "Litigation",
  "Family Law",
  "Immigration",
  "Personal Injury",
  "Criminal Defense",
  "Estate Planning",
  "Probate",
  "Real Estate",
  "Business / Corporate",
];

function InlineField({
  icon,
  label,
  value,
  placeholder,
  onChange,
  numeric,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  placeholder: string;
  onChange: (v: string | null) => void;
  numeric?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  function commit() {
    onChange(draft.trim() ? draft.trim() : null);
    setOpen(false);
  }

  if (open) {
    return (
      <input
        autoFocus
        type={numeric ? "number" : "text"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className="bg-card-alt border border-line rounded-full px-3.5 py-1.5 text-[13px] font-medium outline-none placeholder:text-muted min-w-[130px]"
      />
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(value ?? "");
        setOpen(true);
      }}
      className="flex items-center gap-1.5 bg-chip hover:bg-btn transition-colors px-3 py-1.5 rounded-full text-[13px] font-medium"
    >
      {icon}
      {value ?? label}
    </button>
  );
}

export default function NewMatterModal({
  matter,
  clients,
  onClose,
  onSubmit,
}: {
  matter?: Matter;
  clients: Client[];
  onClose: () => void;
  onSubmit: (matter: Matter) => void;
}) {
  const isEdit = !!matter;
  const [title, setTitle] = useState(matter?.title ?? "");
  const [description, setDescription] = useState(matter?.description ?? "");
  const [status, setStatus] = useState<MatterStatus>(matter?.status ?? "Lead");
  const [clientId, setClientId] = useState<string | null>(matter?.clientId ?? null);
  const [dueDate, setDueDate] = useState<string | null>(matter?.dueDate ?? null);
  const [category, setCategory] = useState<MatterCategory | null>(matter?.category ?? null);
  const [counterparty, setCounterparty] = useState<string | null>(matter?.counterparty ?? null);
  const [blocker, setBlocker] = useState<string | null>(matter?.blocker ?? null);
  const [value, setValue] = useState<string | null>(
    matter?.value != null ? String(matter.value) : null
  );
  const [billingType, setBillingType] = useState<BillingType>(matter?.billingType ?? "Hourly");
  const [hourlyRate, setHourlyRate] = useState<string | null>(
    matter?.hourlyRate != null ? String(matter.hourlyRate) : null
  );

  const [matterCode, setMatterCode] = useState(matter?.matterCode ?? "");
  const numbered = !!matter?.matterNumber;
  // New matters (and older matters without a number) pick a type + abbreviation.
  const needsNumber = !numbered;
  const codeOk = isValidCode(matterCode);
  const [nextNo, setNextNo] = useState<{ next: number; year: number } | null>(null);
  useEffect(() => {
    if (!needsNumber) return;
    let live = true;
    fetch("/api/matters/next-number")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d && typeof d.next === "number" && setNextNo({ next: d.next, year: d.year }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [needsNumber]);
  // Your own number instead of the next one (null = use the next number).
  const [ownNumber, setOwnNumber] = useState<string | null>(null);
  const own = ownNumber === null ? null : cleanNumber(ownNumber);
  const ownOk = own !== null && NUMBER_PATTERN.test(own);
  const [taken, setTaken] = useState<{ number: string; taken: boolean } | null>(null);
  useEffect(() => {
    if (!own || !ownOk) return;
    let live = true;
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ check: own });
      if (matter?.id) qs.set("except", matter.id);
      fetch(`/api/matters/next-number?${qs}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => live && d && setTaken({ number: own, taken: !!d.taken }))
        .catch(() => {});
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [own, ownOk, matter?.id]);
  const ownChecked = own !== null && taken?.number === own;
  const ownFree = ownOk && ownChecked && !taken?.taken;
  const numberOk = ownNumber === null ? (isEdit ? !matterCode || codeOk : codeOk) : ownFree;
  const suggested = codeOk && nextNo ? formatMatterNumber(cleanCode(matterCode), nextNo.year, nextNo.next) : "";
  const canSave = !!title.trim() && (isEdit ? numberOk : !!category && numberOk);

  const [statusOpen, setStatusOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [clientQ, setClientQ] = useState("");
  const [billingOpen, setBillingOpen] = useState(false);

  const StatusIcon = matterStatusMeta[status].icon;
  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  // The matter as typed so far.
  function buildMatter(): Matter {
    return {
      id: matter?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description,
      status,
      clientId,
      dueDate,
      category,
      counterparty,
      blocker,
      value: value ? Number(value) : null,
      billingType,
      hourlyRate: hourlyRate ? Number(hourlyRate) : null,
      assignedTo: matter?.assignedTo ?? null,
      privateNotes: matter?.privateNotes ?? "",
      matterCode: numbered ? matter?.matterCode ?? null : own && ownOk ? own.split("-")[0] : codeOk ? cleanCode(matterCode) : null,
      matterNumber: numbered ? matter?.matterNumber ?? null : own && ownOk ? own : null,
      matterSeq: matter?.matterSeq ?? null,
      createdAt: matter?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function handleSubmit() {
    if (!canSave) return;
    onSubmit(buildMatter());
  }

  const basics = (
    <>
        {needsNumber ? (
          <div className="px-7 pt-3 flex flex-col gap-4">
            <div>
              <div className="text-[12.5px] font-semibold text-muted mb-2">Matter type</div>
              <GenericDropdown
                open={typeOpen}
                setOpen={setTypeOpen}
                trigger={
                  <span className={`min-w-[180px] text-left ${category ? "text-ink" : "text-muted"}`}>{category ?? "Select matter type"}</span>
                }
              >
                <div className="max-h-[min(360px,50vh)] overflow-y-auto min-w-[240px]">
                  {[...MAIN_TYPES, ...matterCategories.filter((c) => c !== "None" && !MAIN_TYPES.includes(c))].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setCategory(t);
                        setTypeOpen(false);
                        const first = SUGGESTED_CODES[t]?.[0]?.code;
                        // Fill in the usual abbreviation unless one was typed for this type already.
                        if (first && !SUGGESTED_CODES[t].some((x) => x.code === matterCode)) setMatterCode(first);
                      }}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip transition-colors whitespace-nowrap"
                    >
                      {t}
                      {category === t && <Check size={14} strokeWidth={2} />}
                    </button>
                  ))}
                </div>
              </GenericDropdown>
            </div>
            <div>
              <div className="text-[12.5px] font-semibold text-muted mb-2">Abbreviation</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {(category ? SUGGESTED_CODES[category] ?? [] : []).map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setMatterCode(c.code)}
                    className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                      matterCode === c.code ? "bg-btn-hover text-ink font-semibold" : "bg-chip hover:bg-btn"
                    }`}
                  >
                    {c.code} <span className={"text-muted"}>· {c.label}</span>
                  </button>
                ))}
                <input
                  value={matterCode}
                  onChange={(e) => setMatterCode(cleanCode(e.target.value))}
                  placeholder="e.g. REP"
                  aria-label="Abbreviation"
                  className="w-[110px] bg-white border border-line rounded-full px-3.5 py-1.5 text-[13px] font-semibold tracking-wide outline-none placeholder:text-muted placeholder:font-normal"
                />
              </div>
              <div className="text-[12.5px] text-muted mt-2">
                {ownNumber !== null ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>Matter number:</span>
                      <input
                        autoFocus
                        value={ownNumber}
                        onChange={(e) => setOwnNumber(cleanNumber(e.target.value))}
                        placeholder="e.g. REP-2026-3709"
                        aria-label="Your own matter number"
                        className="w-[170px] bg-white border border-line rounded-full px-3 py-1 text-[13px] font-semibold tracking-wide text-ink outline-none"
                      />
                      <button type="button" onClick={() => setOwnNumber(null)} className="underline underline-offset-2 hover:text-ink">
                        Use the next number{suggested ? ` (${suggested})` : ""}
                      </button>
                    </div>
                    {own && !ownOk ? (
                      <span className="text-[#B4232C]">Type it like REP-2026-3709.</span>
                    ) : ownChecked && taken?.taken ? (
                      <span className="text-[#B4232C]">{own} is already used by another matter.</span>
                    ) : ownFree ? (
                      <span className="text-[#1F7A4D]">{own} is free.</span>
                    ) : ownOk ? (
                      <span>Checking…</span>
                    ) : null}
                  </div>
                ) : matterCode && !codeOk ? (
                  <span className="text-[#B4232C]">Use 2–6 letters or numbers, starting with a letter.</span>
                ) : codeOk ? (
                  <>
                    Matter number:{" "}
                    <span className="font-semibold text-ink">
                      {nextNo ? formatMatterNumber(cleanCode(matterCode), nextNo.year, nextNo.next) : `${cleanCode(matterCode)}-${new Date().getFullYear()}-…`}
                    </span>{" "}
                    (given when you click {isEdit ? "Save" : "Create"}) ·{" "}
                    <button type="button" onClick={() => setOwnNumber(suggested || `${cleanCode(matterCode)}-${nextNo?.year ?? new Date().getFullYear()}-`)} className="underline underline-offset-2 hover:text-ink">
                      Change
                    </button>
                  </>
                ) : isEdit ? (
                  "Add an abbreviation to give this matter a number."
                ) : (
                  "Pick a matter type, then the abbreviation (REP = purchase, RES = sale)."
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="px-7 pt-3">
            <span className="inline-flex items-center gap-1.5 bg-card-alt rounded-full px-3 py-1 text-[13px] font-semibold">
              {matter?.matterNumber}
            </span>
          </div>
        )}

        <div className="px-7 pt-4 pb-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Matter title"
            className="w-full bg-transparent outline-none text-[26px] font-medium placeholder:text-muted-light mb-2"
            autoFocus
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add description..."
            rows={2}
            className="w-full bg-transparent outline-none text-[14px] placeholder:text-muted resize-none"
          />
        </div>

        <div className="px-7 pt-3 pb-2 flex flex-wrap items-center gap-2">
          <GenericDropdown
            open={statusOpen}
            setOpen={setStatusOpen}
            trigger={
              <>
                <StatusIcon size={13} strokeWidth={2} className={matterStatusMeta[status].color} />
                {status}
              </>
            }
          >
            {matterStatusOrder.map((s) => {
              const Icon = matterStatusMeta[s].icon;
              return (
                <button
                  key={s}
                  onClick={() => {
                    setStatus(s);
                    setStatusOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Icon size={15} strokeWidth={2} className={matterStatusMeta[s].color} />
                    {s}
                  </span>
                  {s === status && <Check size={14} strokeWidth={2} />}
                </button>
              );
            })}
          </GenericDropdown>

          <GenericDropdown
            open={clientOpen}
            setOpen={setClientOpen}
            direction="up"
            trigger={
              selectedClient ? (
                <>
                  <span
                    className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-semibold flex-shrink-0"
                    style={{ backgroundColor: getAvatarColor(selectedClient.name), color: "#fff" }}
                  >
                    {getInitials(selectedClient.name)}
                  </span>
                  {selectedClient.name}
                </>
              ) : (
                <>
                  <UserPlus size={13} strokeWidth={1.75} />
                  Add a client
                </>
              )
            }
          >
            {clients.length === 0 ? (
              <div className="px-3 py-2.5 text-[13.5px] text-muted">No clients yet</div>
            ) : (
              <div className="w-[min(380px,80vw)]">
                <div className="flex items-center gap-2 bg-chip rounded-full px-3 py-1.5 mb-1.5 mx-0.5">
                  <Search size={13} className="text-muted flex-shrink-0" />
                  <input
                    autoFocus
                    value={clientQ}
                    onChange={(e) => setClientQ(e.target.value)}
                    placeholder="Search clients by name"
                    aria-label="Search clients"
                    className="flex-1 min-w-0 bg-transparent outline-none text-[13.5px]"
                  />
                </div>
                <div className="max-h-[min(230px,30vh)] overflow-y-auto">
                  {(() => {
                    const q = clientQ.trim().toLowerCase();
                    const list = clients.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q)).sort((a, b) => sortName(a.name).localeCompare(sortName(b.name)));
                    if (!list.length) return <div className="px-3 py-2.5 text-[13.5px] text-muted">No clients match “{clientQ.trim()}”.</div>;
                    return list.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setClientId(c.id);
                          setClientOpen(false);
                          setClientQ("");
                        }}
                        title={c.name}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium hover:bg-chip transition-colors text-left"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold flex-shrink-0"
                            style={{ backgroundColor: getAvatarColor(c.name), color: "#fff" }}
                          >
                            {getInitials(c.name)}
                          </span>
                          <span className="truncate whitespace-nowrap">{c.name}</span>
                        </span>
                        {c.id === clientId && <Check size={14} strokeWidth={2} className="flex-shrink-0" />}
                      </button>
                    ));
                  })()}
                </div>
              </div>
            )}
          </GenericDropdown>

          {/* Client portal for the chosen client: invite them or manage their access. */}
          {clientId && <PortalButton clientId={clientId} defaultEmail={selectedClient?.email ?? undefined} defaultName={selectedClient?.name} />}

          <GenericDropdown
            open={dateOpen}
            setOpen={setDateOpen}
            trigger={
              <>
                <CalendarDays size={13} strokeWidth={1.75} />
                {dueDate ?? "Due date"}
              </>
            }
          >
            <div className="p-2">
              <input
                type="date"
                value={dueDate ?? ""}
                onChange={(e) => setDueDate(e.target.value || null)}
                className="w-full bg-card-alt rounded-lg px-3 py-2 text-[13.5px] outline-none"
              />
            </div>
          </GenericDropdown>

          {!needsNumber && (
          <GenericDropdown
            open={categoryOpen}
            setOpen={setCategoryOpen}
            trigger={
              <>
                <Tag size={13} strokeWidth={1.75} />
                {category ?? "Category"}
              </>
            }
          >
            {matterCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setCategory(cat === "None" ? null : cat);
                  setCategoryOpen(false);
                }}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip transition-colors"
              >
                {cat}
                {(cat === "None" ? category === null : cat === category) && (
                  <Check size={14} strokeWidth={2} />
                )}
              </button>
            ))}
          </GenericDropdown>
          )}

          <InlineField
            icon={<Handshake size={13} strokeWidth={1.75} />}
            label="Counterparty"
            value={counterparty}
            placeholder="Opposing party"
            onChange={setCounterparty}
          />
          <InlineField
            icon={<TriangleAlert size={13} strokeWidth={1.75} />}
            label="Blocker"
            value={blocker}
            placeholder="What's blocking this?"
            onChange={setBlocker}
          />
        </div>

        <div className="px-7 pb-6 flex flex-wrap items-center gap-2">
          <InlineField
            icon={<DollarSign size={13} strokeWidth={1.75} />}
            label="Value"
            value={value}
            placeholder="Matter value"
            onChange={setValue}
            numeric
          />

          <GenericDropdown
            open={billingOpen}
            setOpen={setBillingOpen}
            trigger={
              <>
                <Link2 size={13} strokeWidth={1.75} />
                {billingType}
              </>
            }
          >
            {(["Hourly", "Flat fee"] as BillingType[]).map((b) => (
              <button
                key={b}
                onClick={() => {
                  setBillingType(b);
                  setBillingOpen(false);
                }}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip transition-colors"
              >
                {b}
                {b === billingType && <Check size={14} strokeWidth={2} />}
              </button>
            ))}
          </GenericDropdown>

          <InlineField
            icon={<Link2 size={13} strokeWidth={1.75} />}
            label="Hourly rate"
            value={hourlyRate}
            placeholder={billingType === "Flat fee" ? "$" : "$/hr"}
            onChange={setHourlyRate}
            numeric
          />
        </div>
    </>
  );

  // A new matter: the full window with sections (details, contacts, billing, task lists, documents, conflict check).
  if (!isEdit)
    return <MatterCreateWindow basics={basics} canSave={canSave} buildMatter={buildMatter} onClose={onClose} />;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/15 px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-cream rounded-3xl w-full max-w-[864px] max-h-[90vh] overflow-y-auto shadow-[0_30px_80px_-20px_rgba(18,17,16,0.35)]"
      >
        <div className="flex items-center justify-between px-7 pt-6 pb-2">
          <div className="flex items-center gap-2 text-[13.5px] text-muted font-medium">
            <span className="flex items-center gap-1.5 bg-card-alt px-2.5 py-1 rounded-full">
              <Briefcase size={12} strokeWidth={1.75} /> Matters
            </span>
            <span>›</span>
            <span className="text-ink font-semibold">{isEdit ? "Edit matter" : "New matter"}</span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {basics}

        <div className="flex items-center justify-end px-7 py-5 border-t border-line">
          <button
            onClick={handleSubmit}
            disabled={!canSave}
            className="bg-btn text-ink px-5 py-2.5 rounded-full text-[14px] font-medium hover:bg-btn-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isEdit ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
