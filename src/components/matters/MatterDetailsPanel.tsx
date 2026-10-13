"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ClipboardList, Loader2, Sparkles, FileSearch } from "lucide-react";
import { layoutFor, estimateToClose, money, type DetailField, type MatterDetails } from "@/lib/matters/details";
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

// Parties, property and contract figures for the matter type (purchase: our client
// is the buyer; sale: the seller). Filled from documents by the AI, editable by hand.
export default function MatterDetailsPanel({ matter, keyDates, wide = false }: { matter: Matter; keyDates: KeyDatesApi; wide?: boolean }) {
  const { layout } = layoutFor(matter);
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

  async function save(key: string, value: string) {
    try {
      setDetails(await call(`/api/matters/${matter.id}/details`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: { [key]: value } }) }));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
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
          onClick={() => void keyDates.refresh()}
          disabled={keyDates.reading}
          title="Read the matter's documents and fill in what they say (fields you typed are kept)"
          className="ml-auto flex items-center gap-1.5 bg-chip hover:bg-btn disabled:opacity-50 px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors"
        >
          {keyDates.reading ? <Loader2 size={12} className="animate-spin" /> : <FileSearch size={12} strokeWidth={1.75} />}
          {keyDates.reading ? "Reading…" : "Fill from documents"}
        </button>
      </div>
      {error && <div className="mx-4 mt-3 rounded-xl bg-[#FDF1E7] text-[#8A4B14] px-3 py-2 text-[12.5px]">{error}</div>}
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
                  <span className="text-[13px] font-semibold flex-1 truncate">{sec.title}</span>
                  <span className="text-[11.5px] text-muted">{count ? `${count}/${sec.fields.length}` : ""}</span>
                </button>
                {!isCollapsed && (
                  <div className={wide ? "pb-3 flex flex-col gap-1" : "px-4 pb-3 flex flex-col gap-1"}>
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

function FieldRow({ field, value, hint, onSave }: { field: DetailField; value?: { value: string; source?: string | null; manual?: boolean }; hint?: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value?.value ?? "";
  const fromDocs = value && !value.manual && value.source && value.source !== "Client record";
  function commit() {
    if (draft === null) return;
    let v = draft.trim();
    if (field.kind === "money" && v) v = asMoney(v);
    setDraft(null);
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
            if (e.key === "Escape") setDraft(null);
          }}
          type={field.kind === "email" ? "email" : field.kind === "phone" ? "tel" : "text"}
          placeholder={hint ?? field.placeholder ?? ""}
          aria-label={field.label}
          className={`w-full min-w-0 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-line focus:border-line rounded-lg px-2 py-1 text-[13px] outline-none placeholder:text-muted-light ${
            fromDocs ? "pr-6" : ""
          }`}
        />
        {fromDocs && (
          <span title={`From ${value.source}`} className="absolute right-1.5 text-[#7C6CF2]">
            <Sparkles size={11} />
          </span>
        )}
      </span>
    </label>
  );
}
