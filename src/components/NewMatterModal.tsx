"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { GenericDropdown } from "@/components/NewTaskModal";
import { Client, getInitials, getAvatarColor } from "@/components/NewClientModal";
import { SUGGESTED_CODES, cleanCode, isValidCode, formatMatterNumber } from "@/lib/matters/numbering";

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
  const canSave = !!title.trim() && (isEdit ? !matterCode || codeOk : !!category && codeOk);

  const [statusOpen, setStatusOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);

  const StatusIcon = matterStatusMeta[status].icon;
  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  function handleSubmit() {
    if (!canSave) return;
    onSubmit({
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
      matterCode: numbered ? matter?.matterCode ?? null : codeOk ? cleanCode(matterCode) : null,
      matterNumber: matter?.matterNumber ?? null,
      matterSeq: matter?.matterSeq ?? null,
      createdAt: matter?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-cream rounded-3xl w-full max-w-[720px] max-h-[90vh] overflow-y-auto"
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

        {needsNumber ? (
          <div className="px-7 pt-3 flex flex-col gap-4">
            <div>
              <div className="text-[12.5px] font-semibold text-muted mb-2">Matter type</div>
              <div className="flex flex-wrap gap-1.5">
                {[...MAIN_TYPES, ...matterCategories.filter((c) => c !== "None" && !MAIN_TYPES.includes(c))].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setCategory(t);
                      const first = SUGGESTED_CODES[t]?.[0]?.code;
                      // Fill in the usual abbreviation unless one was typed for this type already.
                      if (first && !SUGGESTED_CODES[t].some((x) => x.code === matterCode)) setMatterCode(first);
                    }}
                    className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                      category === t ? "bg-btn-hover text-ink font-semibold" : "bg-chip hover:bg-btn"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
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
                {matterCode && !codeOk ? (
                  <span className="text-[#B4232C]">Use 2–6 letters or numbers, starting with a letter.</span>
                ) : codeOk ? (
                  <>
                    Matter number:{" "}
                    <span className="font-semibold text-ink">
                      {nextNo ? formatMatterNumber(cleanCode(matterCode), nextNo.year, nextNo.next) : `${cleanCode(matterCode)}-${new Date().getFullYear()}-…`}
                    </span>{" "}
                    (given when you click {isEdit ? "Save" : "Create"})
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
              clients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setClientId(c.id);
                    setClientOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-chip transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold"
                      style={{ backgroundColor: getAvatarColor(c.name), color: "#fff" }}
                    >
                      {getInitials(c.name)}
                    </span>
                    {c.name}
                  </span>
                  {c.id === clientId && <Check size={14} strokeWidth={2} />}
                </button>
              ))
            )}
          </GenericDropdown>

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
            placeholder="$/hr"
            onChange={setHourlyRate}
            numeric
          />
        </div>

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
