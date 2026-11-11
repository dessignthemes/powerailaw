"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ClipboardList, Loader2, Sparkles, FileSearch, Contact, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { layoutFor, estimateToClose, money, REFERRAL_TYPES, type DetailField, type MatterDetails } from "@/lib/matters/details";
import type { Matter } from "@/components/NewMatterModal";
import type { KeyDatesApi } from "@/components/matters/KeyDatesCard";

async function call(url: string, init?: RequestInit): Promise<MatterDetails> {
  const res = await fetch(url, init);
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d?.error ?? "Something went wrong. Please try again.");
  return (d.details ?? {}) as MatterDetails;
}

const asMoney = (v: string) => {
  const n = Number(v.replace(/[^\d.]/g, ""));
  return /\d/.test(v) && Number.isFinite(n) ? money(n) : v;
};

// Which fields look people and companies up in Contacts while you type.
type Suggest = "person" | "company" | "any";
const COMPANY_KEYS = new Set(["titleCompany", "lender", "inspector", "surveyor", "settlementAgent"]);
function suggestFor(key: string): Suggest | null {
  if (key.endsWith("Names")) return "any";
  if (key.endsWith("Name")) return "person";
  if (key.endsWith("Firm") || COMPANY_KEYS.has(key)) return "company";
  return null;
}
export type ContactHit = { id: string; kind: string; name: string; email: string | null; phone: string | null; company: string; category: string; type: string };
// The role a section's people get on the matter's contacts (see detailsSync).
const SECTION_ROLES: Record<string, RegExp> = {
  buyer: /^buyer( \(our client\))?$/i,
  seller: /^seller( \(our client\))?$/i,
  client: /^client$/i,
  other: /^other (party|side's attorney)$/i,
  referral: /^referred by$/i,
  buyerAgent: /^buyer's realtor$/i,
  listingAgent: /^listing agent$/i,
  buyerAttorney: /^buyer's attorney$/i,
  sellerAttorney: /^seller's attorney$/i,
  closing: /^(lender|settlement agent)$/i,
  more: /^(inspector|surveyor|title company)$/i,
};
type Linked = { targetId: string; kind: "contact" | "client"; name: string; role: string };

// Parties, property and contract figures for the matter type (purchase: our client
// is the buyer; sale: the seller). Filled from documents by the AI, editable by hand.
export default function MatterDetailsPanel({ matter, keyDates, wide = false }: { matter: Matter; keyDates: KeyDatesApi; wide?: boolean }) {
  const { layout } = layoutFor(matter);
  const router = useRouter();
  const [details, setDetails] = useState<MatterDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const extractedAt = keyDates.data?.state.extractedAt ?? null;
  const cash = !!keyDates.data?.state.dates.mortgage?.na;

  // Loaded again after the documents are read (the AI fills empty fields).
  useEffect(() => {
    let live = true;
    call(`/api/matters/${matter.id}/details`)
      .then((d) => live && (setDetails(d), setError(null)))
      .catch((e: Error) => live && (setError(e.message), setDetails({})));
    return () => {
      live = false;
    };
  }, [matter.id, extractedAt, matter.clientId]);

  // Who from Contacts is on this matter (to show "In Contacts" on each section).
  const [linked, setLinked] = useState<Linked[]>([]);
  const [linkTick, setLinkTick] = useState(0);
  useEffect(() => {
    let live = true;
    fetch(`/api/matters/${matter.id}/contacts`)
      .then((r) => (r.ok ? r.json() : { contacts: [] }))
      .then((d) => live && setLinked((d.contacts ?? []) as Linked[]))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [matter.id, linkTick, extractedAt]);

  async function saveMany(values: Record<string, string>) {
    try {
      setDetails(await call(`/api/matters/${matter.id}/details`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) }));
      setError(null);
      setLinkTick((t) => t + 1); // the save also links people to Contacts
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const save = (key: string, value: string) => saveMany({ [key]: value });

  // A contact picked from the suggestions: its name, plus its email, phone and company where empty.
  function pick(f: DetailField, c: ContactHit, current: string) {
    const d = details ?? {};
    const empty = (k: string) => !d[k]?.value;
    const values: Record<string, string> = {};
    if (f.key.endsWith("Names")) {
      const parts = current.split(",").map((x) => x.trim()).filter(Boolean);
      parts.pop();
      values[f.key] = [...parts, c.name].join(", ");
      const prefix = f.key.slice(0, -5);
      if (!parts.length) {
        if (c.email && empty(`${prefix}Email`)) values[`${prefix}Email`] = c.email;
        if (c.phone && empty(`${prefix}Phone`)) values[`${prefix}Phone`] = c.phone;
      }
    } else if (f.key.endsWith("Name")) {
      const prefix = f.key.slice(0, -4);
      values[f.key] = c.name;
      if (c.email && empty(`${prefix}Email`)) values[`${prefix}Email`] = c.email;
      if (c.phone && empty(`${prefix}Phone`)) values[`${prefix}Phone`] = c.phone;
      if (c.company && empty(`${prefix}Firm`)) values[`${prefix}Firm`] = c.company;
    } else values[f.key] = c.name;
    void saveMany(values);
  }

  // Look everyone in Details up in Contacts (fills blanks, adds who's missing).
  const [matching, setMatching] = useState(false);
  const [matchNote, setMatchNote] = useState<string | null>(null);
  async function matchContacts() {
    setMatching(true);
    setMatchNote(null);
    try {
      const res = await fetch(`/api/matters/${matter.id}/details`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "contacts" }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? "Something went wrong. Please try again.");
      setDetails(d.details ?? {});
      const r = d.contacts as { created: number; matched: number; linked: number; filled: number };
      const parts = [
        r.matched ? `${r.matched} found in Contacts` : "",
        r.created ? `${r.created} added to Contacts` : "",
        r.filled ? `${r.filled} ${r.filled === 1 ? "detail" : "details"} filled from contact cards` : "",
        r.linked ? `${r.linked} put on this matter's contacts` : "",
      ].filter(Boolean);
      setMatchNote(parts.length ? `${parts.join(" · ")}.` : "Nothing new: everyone here is already in Contacts.");
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMatching(false);
    }
  }

  const filled = details ? Object.keys(details).length : 0;

  return (
    <div className="rounded-2xl overflow-hidden border border-line">
      <div className="flex flex-wrap items-center gap-2 bg-card-alt px-4 py-3">
        <ClipboardList size={14} strokeWidth={1.75} className="text-muted" />
        <span className="text-[14px] font-semibold">Details</span>
        {matter.matterNumber && <span className="text-[12.5px] text-muted">{matter.matterNumber}</span>}
        <button
          onClick={() => void matchContacts()}
          disabled={matching || !filled}
          title="Look up every person and company here in Contacts: fill empty fields from their cards, add anyone missing (under their company), and put them on this matter"
          className="ml-auto flex items-center gap-1.5 bg-chip hover:bg-btn disabled:opacity-50 px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors"
        >
          {matching ? <Loader2 size={12} className="animate-spin" /> : <Contact size={12} strokeWidth={1.75} />}
          {matching ? "Matching…" : "Match with Contacts"}
        </button>
        <button
          onClick={() => void keyDates.refresh()}
          disabled={keyDates.reading}
          title="Read the matter's documents and fill in what they say (fields you typed are kept)"
          className="flex items-center gap-1.5 bg-chip hover:bg-btn disabled:opacity-50 px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors"
        >
          {keyDates.reading ? <Loader2 size={12} className="animate-spin" /> : <FileSearch size={12} strokeWidth={1.75} />}
          {keyDates.reading ? "Reading…" : "Fill from documents"}
        </button>
      </div>
      {error && <div className="mx-4 mt-3 rounded-xl bg-[#FDF1E7] text-[#8A4B14] px-3 py-2 text-[12.5px]">{error}</div>}
      {matchNote && (
        <div className="mx-4 mt-3 rounded-xl bg-[#E8F6EE] text-[#1F7A4D] px-3 py-2 text-[12.5px] flex items-start gap-2">
          <span className="flex-1">{matchNote}</span>
          <button onClick={() => setMatchNote(null)} className="underline underline-offset-2">OK</button>
        </div>
      )}
      {details === null ? (
        <div className="p-4 text-[13px] text-muted flex items-center gap-2">
          <Loader2 size={13} className="animate-spin" /> Loading…
        </div>
      ) : (
        <div className={wide ? "p-4 grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-1" : "py-1"}>
          {filled === 0 && (
            <div className={`${wide ? "lg:col-span-2" : ""} px-4 py-2 text-[12.5px] text-muted`}>
              {layoutFor(matter).side ? "Upload the contract and attorney review letters" : "Upload this matter's documents"} (Documents tab), then click{" "}
              <b>Fill from documents</b>, or type the details in.
            </div>
          )}
          {layout.map((sec) => {
            const isCollapsed = collapsed[sec.id] ?? false;
            const count = sec.fields.filter((f) => details[f.key]).length;
            return (
              <div key={sec.id} className={wide ? "" : "border-t border-line first:border-t-0"}>
                <button
                  onClick={() => setCollapsed((c) => ({ ...c, [sec.id]: !isCollapsed }))}
                  className={`w-full flex items-center gap-1.5 text-left ${wide ? "py-2" : "px-4 py-2.5"}`}
                >
                  {isCollapsed ? <ChevronRight size={13} className="text-muted" /> : <ChevronDown size={13} className="text-muted" />}
                  <span className="text-[13px] font-semibold truncate">{sec.title}</span>
                  {(() => {
                    const re = SECTION_ROLES[sec.id];
                    const who = re ? linked.filter((l) => re.test(l.role.trim())) : [];
                    if (!who.length) return <span className="flex-1" />;
                    const first = who.find((w) => w.kind === "contact");
                    return (
                      <span className="flex-1 min-w-0 flex">
                        {/* (a span: the whole header row is already a button) */}
                        <span
                          role="link"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(first ? `/dashboard/records?contact=${first.targetId}` : "/dashboard/records");
                          }}
                          title={`Linked to Contacts: ${who.map((w) => w.name).join(", ")}. Click to open the contact card.`}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#E8F6EE] text-[#1F7A4D] text-[11px] font-medium truncate max-w-full hover:underline cursor-pointer"
                        >
                          <CheckCircle2 size={11} /> In Contacts
                        </span>
                      </span>
                    );
                  })()}
                  <span className="text-[11.5px] text-muted">{count ? `${count}/${sec.fields.length}` : ""}</span>
                </button>
                {!isCollapsed && (
                  <div className={wide ? "pb-3 flex flex-col gap-1.5" : "px-4 pb-3 flex flex-col gap-1.5"}>
                    {sec.fields.map((f) => (
                      <FieldRow
                        key={f.key}
                        field={f}
                        value={details[f.key]}
                        hint={
                          f.key === "amountToClose" && !details[f.key]
                            ? (() => {
                                const est = estimateToClose(details);
                                return est ? `≈ ${est} (price − deposits − mortgage, before closing costs)` : undefined;
                              })()
                            : f.key === "mortgageAmount" && cash && !details[f.key]
                              ? "None: cash deal"
                              : undefined
                        }
                        onSave={(v) => void save(f.key, v)}
                        suggest={suggestFor(f.key)}
                        onPick={(c, current) => pick(f, c, current)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// "Add email", "Add phone", "Add purchase price" … so empty boxes say what goes in them.
function addHint(f: DetailField) {
  if (f.kind === "email") return "Add email";
  if (f.kind === "phone") return "Add phone";
  if (f.kind === "money") return "$0.00";
  return `Add ${f.label.toLowerCase()}`;
}

function FieldRow({
  field,
  value,
  hint,
  onSave,
  suggest,
  onPick,
}: {
  field: DetailField;
  value?: { value: string; source?: string | null; manual?: boolean };
  hint?: string;
  onSave: (v: string) => void;
  suggest?: Suggest | null;
  onPick?: (c: ContactHit, current: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value?.value ?? "";
  const fromDocs = value && !value.manual && value.source && value.source !== "Client record";
  // Contacts that match what's being typed (after a short pause).
  const [hits, setHits] = useState<ContactHit[]>([]);
  const term = draft === null ? "" : field.key.endsWith("Names") ? draft.split(",").pop()!.trim() : draft.trim();
  useEffect(() => {
    if (!suggest || term.length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      fetch(`/api/contacts/search?${new URLSearchParams({ q: term, ...(suggest === "any" ? {} : { kind: suggest }) })}`)
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d) => live && setHits((d.results ?? []) as ContactHit[]))
        .catch(() => undefined);
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [term, suggest]);
  const showHits = !!suggest && draft !== null && term.length >= 2 && hits.length > 0;
  function commit() {
    if (draft === null) return;
    let v = draft.trim();
    if (field.kind === "money" && v) v = asMoney(v);
    setDraft(null);
    setHits([]);
    if (v !== (value?.value ?? "")) onSave(v);
  }
  return (
    <label className="grid grid-cols-[118px_1fr] items-center gap-2">
      <span className="text-[12px] text-muted truncate" title={field.label}>
        {field.label}
      </span>
      <span className="relative flex items-center min-w-0">
        <input
          value={shown}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setDraft(null);
              setHits([]);
            }
          }}
          type={field.kind === "email" ? "email" : field.kind === "phone" ? "tel" : "text"}
          placeholder={hint ?? field.placeholder ?? addHint(field)}
          aria-label={field.label}
          autoComplete="off"
          list={field.key === "referralType" ? "lp-referral-types" : undefined}
          data-1p-ignore
          data-lpignore="true"
          className={`w-full min-w-0 bg-white border border-line hover:border-[#CECAC3] focus:border-[#BFBAB0] rounded-lg px-2.5 py-1.5 text-[13px] outline-none placeholder:text-muted-light transition-colors ${
            fromDocs ? "pr-6" : ""
          }`}
        />
        {field.key === "referralType" && (
          <datalist id="lp-referral-types">
            {REFERRAL_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        )}
        {fromDocs && (
          <span title={value.source === "Contacts" ? "From the contact card in Contacts" : `From ${value.source}`} className="absolute right-1.5 text-[#7C6CF2]">
            <Sparkles size={11} />
          </span>
        )}
        {showHits && (
          <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white rounded-xl border border-[#E8E6E2] shadow-[0_12px_30px_-12px_rgba(18,17,16,0.25)] p-1 max-h-[260px] overflow-y-auto">
            <div className="px-2.5 pt-1 pb-0.5 text-[10.5px] font-mono uppercase tracking-[0.1em] text-muted">In Contacts</div>
            {hits.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault(); // keep the typed text from being saved first
                  const current = draft ?? "";
                  setDraft(null);
                  setHits([]);
                  onPick?.(c, current);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#F3F2F0]"
              >
                <span className="block text-[13px] font-medium truncate">{c.name}</span>
                <span className="block text-[11.5px] text-muted truncate">
                  {[c.kind === "person" && c.company ? c.company : c.type, c.email, c.phone].filter(Boolean).join(" · ") || (c.kind === "person" ? "Person" : "Company")}
                </span>
              </button>
            ))}
          </div>
        )}
      </span>
    </label>
  );
}
