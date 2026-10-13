"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, Loader2, RefreshCw, RotateCcw, FileText, ChevronDown, ChevronRight, Info, PenLine, Settings2, ArrowUp, ArrowDown, Trash2, Plus, Upload, History, X } from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import { DOCS_CHANGED_EVENT } from "@/components/documents/DocumentsLibrary";
import {
  ruleText,
  usDate,
  isRealEstate,
  standardFields,
  layoutKey,
  newCustomKey,
  type KeyDatesState,
  type FieldDef,
} from "@/lib/matters/keyDates";
import type { Matter } from "@/components/NewMatterModal";

type Result = { state: KeyDatesState; stale: boolean; ran: boolean; error?: string | null; linked?: number; fields?: FieldDef[]; library?: FieldDef[] };

async function call(url: string, init?: RequestInit): Promise<Result> {
  const res = await fetch(url, init);
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (!d?.error && (res.status === 504 || res.status === 502)) {
      throw new Error("Reading the documents took too long. Click Read documents again: documents already read are kept, so the next try is faster.");
    }
    const err = new Error(d?.error ?? "Something went wrong. Please try again.") as Error & { code?: string };
    err.code = d?.code;
    throw err;
  }
  return d as Result;
}

// Key dates of a matter, kept up to date while the matter page is open:
// when documents change, a real estate matter's documents are read again.
export function useKeyDates(matter: Matter | null) {
  const { refreshAll } = useWorkspaceData();
  const [data, setData] = useState<Result | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setErrorText] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  // Message plus its code (e.g. "no_documents"), from an Error or plain text.
  const setError = useCallback((e: string | (Error & { code?: string }) | null) => {
    if (e === null || typeof e === "string") {
      setErrorText(e);
      setErrorCode(null);
    } else {
      setErrorText(e.message);
      setErrorCode(e.code ?? null);
    }
  }, []);
  const busy = useRef(false);
  const auto = !!matter && isRealEstate(matter);
  const id = matter?.id ?? null;

  const refresh = useCallback(async () => {
    if (busy.current || !id) return;
    busy.current = true;
    setReading(true);
    setError(null);
    try {
      setData(await call(`/api/matters/${id}/key-dates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh" }) }));
      refreshAll(); // task checklists and due dates changed
    } catch (e) {
      setError(e as Error);
    } finally {
      busy.current = false;
      setReading(false);
    }
  }, [id, refreshAll, setError]);

  // Saved dates; if the documents changed, a real estate matter's documents are read again.
  const handle = useCallback(
    (r: Result) => {
      setData(r);
      setError(r.error ?? null);
      if (r.linked) refreshAll(); // older tasks were just linked to this matter
      const running = r.state.runningSince && Date.now() - Date.parse(r.state.runningSince) < 150_000;
      if (r.stale && auto && !running) void refresh();
    },
    [auto, refresh, refreshAll, setError]
  );

  useEffect(() => {
    if (!id) return;
    let live = true;
    const load = () =>
      call(`/api/matters/${id}/key-dates`)
        .then((r) => live && handle(r))
        .catch((e: Error) => live && setError(e));
    load();
    const onDocs = (e: Event) => {
      if ((e as CustomEvent<{ matterId: string }>).detail?.matterId === id) load();
    };
    window.addEventListener(DOCS_CHANGED_EVENT, onDocs);
    return () => {
      live = false;
      window.removeEventListener(DOCS_CHANGED_EVENT, onDocs);
    };
  }, [id, handle, setError]);

  const save = useCallback(
    async (changes: Record<string, string | null>) => { // "na" = not applicable (mortgage)
      if (!id) return;
      setError(null);
      try {
        setData(await call(`/api/matters/${id}/key-dates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", dates: changes }) }));
        refreshAll();
      } catch (e) {
        setError(e as Error);
      }
    },
    [id, refreshAll, setError]
  );

  const reset = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      setData(await call(`/api/matters/${id}/key-dates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset" }) }));
      refreshAll();
    } catch (e) {
      setError(e as Error);
    }
  }, [id, refreshAll, setError]);

  const createLetter = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      setData(await call(`/api/matters/${id}/key-dates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "letter" }) }));
    } catch (e) {
      setError(e as Error);
    }
  }, [id, setError]);

  // Renamed / removed / added fields for this matter type (null = standard fields).
  const saveFields = useCallback(
    async (fields: FieldDef[] | null) => {
      if (!id) return false;
      setError(null);
      try {
        setData(await call(`/api/matters/${id}/key-dates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "fields", fields }) }));
        return true;
      } catch (e) {
        setError(e as Error);
        return false;
      }
    },
    [id, setError]
  );

  // Takes a field off the firm's reusable list.
  const forgetField = useCallback(
    async (key: string) => {
      if (!id) return;
      try {
        setData(await call(`/api/matters/${id}/key-dates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "forget", key }) }));
      } catch (e) {
        setError(e as Error);
      }
    },
    [id, setError]
  );

  return { data, reading, error, errorCode, refresh, save, reset, createLetter, saveFields, forgetField, matter };
}

export type KeyDatesApi = ReturnType<typeof useKeyDates>;

// onOpenDocuments({ upload: true }) also opens the Add documents window.
export default function KeyDatesCard({ api, onOpenDocuments }: { api: KeyDatesApi; onOpenDocuments: (opts?: { upload?: boolean }) => void }) {
  const { data, reading, error, errorCode, refresh, save, reset, createLetter, saveFields, forgetField, matter } = api;
  const realEstate = !!matter && isRealEstate(matter);
  // The fields this matter shows (its type's list, or the firm's own).
  const fields: FieldDef[] = data?.fields ?? (matter ? standardFields(matter) : []);
  const [editing, setEditing] = useState<FieldDef[] | null>(null);
  const [savingFields, setSavingFields] = useState(false);
  const [resetting, setResetting] = useState(false);
  const manualCount = Object.values(data?.state.dates ?? {}).filter((d) => d?.manual).length;
  const [showDocs, setShowDocs] = useState(false);
  const [letterBusy, setLetterBusy] = useState(false);
  const state = data?.state;
  const dates = state?.dates ?? {};
  const facts = state?.facts;
  const ar = dates.attorneyReviewCompleted?.date ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const latestLetter = [...(state?.documents ?? [])].reverse().find((d) => /review|rider|addendum/i.test(d.type));

  return (
    <div className="rounded-2xl overflow-hidden border border-line">
      <div className="flex flex-wrap items-center gap-2 bg-card-alt px-4 py-3">
        <CalendarClock size={14} strokeWidth={1.75} className="text-muted" />
        <span className="text-[14px] font-semibold">Key dates</span>
        <span className="text-[12.5px] text-muted">
          {reading
            ? "Reading the documents…"
            : state?.extractedAt
              ? `From ${state.documents?.length ?? 0} documents · ${new Date(state.extractedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
              : data
                ? "Not read from documents yet"
                : ""}
        </span>
        <button
          onClick={() => setEditing(editing ? null : fields.map((f) => ({ ...f })))}
          title="Rename, remove or add key date fields for this matter type"
          className="ml-auto flex items-center gap-1.5 bg-chip hover:bg-btn px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors"
        >
          <Settings2 size={13} strokeWidth={1.75} /> Edit fields
        </button>
        {manualCount > 0 && (
          <button
            onClick={async () => {
              if (!confirm(`Reset? The ${manualCount === 1 ? "date you entered" : `${manualCount} dates you entered`} will go back to what the documents say.`)) return;
              setResetting(true);
              await reset();
              setResetting(false);
            }}
            disabled={reading || resetting}
            title="Undo dates entered by hand and use the dates from the documents"
            className="flex items-center gap-1.5 bg-chip hover:bg-btn disabled:opacity-50 px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors"
          >
            {resetting ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} strokeWidth={1.75} />} Reset
          </button>
        )}
        <button
          onClick={() => void refresh()}
          disabled={reading}
          className="flex items-center gap-1.5 bg-chip hover:bg-btn disabled:opacity-50 px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors"
        >
          {reading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} strokeWidth={1.75} />}
          {state?.extractedAt ? "Read documents again" : "Read from documents"}
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {error && (
          <div className="rounded-xl bg-[#FDF1E7] text-[#8A4B14] px-3.5 py-2.5 text-[13px] flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="flex-1 min-w-[200px]">{error}</span>
            {errorCode === "no_documents" && (
              <button
                onClick={() => onOpenDocuments({ upload: true })}
                className="flex items-center gap-1.5 bg-white hover:bg-chip text-ink px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-colors"
              >
                <Upload size={13} strokeWidth={1.75} /> Go to Documents
              </button>
            )}
          </div>
        )}
        {data?.stale && !reading && !error && (
          <div className="rounded-xl bg-[#EEF3FB] px-3.5 py-2.5 text-[13px]">The matter&apos;s documents changed since the dates were read.</div>
        )}

        {(facts?.property || facts?.purchasePrice) && (
          <div className="text-[13px] text-muted">
            {[facts.property, facts.purchasePrice && `Price ${facts.purchasePrice}`, facts.buyers?.length && `Buyer: ${facts.buyers.join(", ")}`, facts.sellers?.length && `Seller: ${facts.sellers.join(", ")}`]
              .filter(Boolean)
              .join(" · ")}
          </div>
        )}

        {latestLetter && (
          <div className="text-[12.5px] bg-card-alt rounded-xl px-3.5 py-2">
            Terms in force follow the latest attorney review letter: <b>{latestLetter.title}</b>
            {latestLetter.date ? ` (${usDate(latestLetter.date)})` : ""}.
          </div>
        )}

        <div className="flex flex-col">
          {editing && (
            <FieldEditor
              typeName={matter ? layoutKey(matter) : "this matter type"}
              fields={editing}
              library={data?.library ?? []}
              onForget={(key) => void forgetField(key)}
              onChange={setEditing}
              saving={savingFields}
              onCancel={() => setEditing(null)}
              onSave={async (list) => {
                setSavingFields(true);
                if (await saveFields(list)) setEditing(null);
                setSavingFields(false);
              }}
            />
          )}
          {!editing && fields.map((f, i) => {
            const d = dates[f.key];
            const rule = d ? ruleText(d) : null;
            const past = d?.date && d.date < today;
            return (
              <div key={f.key} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 ${i ? "border-t border-line" : ""}`}>
                <span className="w-[200px] text-[13.5px] font-medium">{f.label}</span>
                {d?.na ? (
                  <span className="w-[134px] text-[13px] font-medium px-2 py-1">Not applicable</span>
                ) : (
                  <input
                    type="date"
                    value={d?.date ?? ""}
                    onChange={(e) => void save({ [f.key]: e.target.value || null })}
                    aria-label={f.label}
                    className={`bg-white border border-line rounded-lg px-2 py-1 text-[13px] outline-none ${past ? "text-muted" : ""}`}
                  />
                )}
                {f.key === "mortgage" && (
                  <label className="flex items-center gap-1.5 text-[12.5px] font-medium cursor-pointer" title="Cash purchase: the mortgage contingency and mortgage steps don't apply">
                    <input type="checkbox" checked={!!d?.na} onChange={(e) => void save({ mortgage: e.target.checked ? "na" : null })} className="accent-[#1b191a]" />
                    Cash deal
                  </label>
                )}
                <span className="text-[12px] text-muted min-w-0 flex-1 truncate" title={d?.quote ?? undefined}>
                  {!d ? (
                    "—"
                  ) : d.na ? (
                    d.manual ? "Cash deal (entered by you)" : "Cash purchase, per the documents"
                  ) : d.manual ? (
                    <span className="inline-flex items-center gap-1">
                      <PenLine size={12} /> Entered by you
                    </span>
                  ) : (
                    <>
                      {rule && <span className="text-ink">{rule}. </span>}
                      {d.source && (
                        <span>
                          From {d.source}
                          {d.sourceDate ? ` (${usDate(d.sourceDate)})` : ""}
                          {d.changedBy?.length ? " · changed by attorney review" : ""}
                        </span>
                      )}
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>

{realEstate && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-card-alt px-3.5 py-2.5 text-[13px]">
          <FileText size={14} strokeWidth={1.75} className="text-muted" />
          <span className="font-medium">Contingency Dates Letter:</span>
          {state?.letter ? (
            <>
              <span className="text-muted">
                created {new Date(state.letter.generatedAt).toLocaleDateString()}
                {state.letter.version > 1 ? ` (version ${state.letter.version})` : ""}
              </span>
              <button onClick={() => onOpenDocuments()} className="font-medium underline underline-offset-2">
                Open in Documents
              </button>
              {!!state.letter.missing?.length && (
                <span className="basis-full text-[12.5px] text-[#8A4B14]">
                  Still blank in the letter: {state.letter.missing.join(", ")}. Fill these in under Details and the letter updates itself.
                </span>
              )}
            </>
          ) : ar && ar <= today ? (
            <span className="text-muted">being prepared…</span>
          ) : ar ? (
            <span className="text-muted">created automatically on {usDate(ar)}, when attorney review concludes</span>
          ) : (
            <span className="text-muted">created automatically once attorney review is completed</span>
          )}
          {ar && (
            <button
              onClick={async () => {
                setLetterBusy(true);
                await createLetter();
                setLetterBusy(false);
              }}
              disabled={letterBusy}
              className="ml-auto flex items-center gap-1.5 bg-chip hover:bg-btn disabled:opacity-50 px-3 py-1 rounded-full text-[12.5px] font-medium"
            >
              {letterBusy && <Loader2 size={12} className="animate-spin" />} {state?.letter ? "Create again" : "Create now"}
            </button>
          )}
        </div>
        )}

        {!!state?.notes?.length && (
          <div className="flex gap-2 text-[12.5px] text-muted">
            <Info size={14} className="flex-shrink-0 mt-0.5" />
            <ul className="flex flex-col gap-0.5">
              {state.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}

        {!!state?.documents?.length && (
          <div>
            <button onClick={() => setShowDocs((v) => !v)} className="flex items-center gap-1 text-[12.5px] font-medium text-muted hover:text-ink">
              {showDocs ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Documents read, oldest to newest
            </button>
            {showDocs && (
              <ol className="mt-2 flex flex-col gap-1 text-[12.5px]">
                {state.documents.map((d, i) => (
                  <li key={d.title + i} className="flex gap-2">
                    <span className="text-muted w-[78px] flex-shrink-0">{d.date ? usDate(d.date) : "no date"}</span>
                    <span>
                      <b>{d.title}</b> <span className="text-muted">· {d.type}{!d.readable ? " · no readable text" : ""}</span>
                      {d.summary && <span className="text-muted"> — {d.summary}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Rename, reorder, remove and add key date fields for a matter type.
function FieldEditor({
  typeName,
  fields,
  library,
  onForget,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  typeName: string;
  fields: FieldDef[];
  library: FieldDef[]; // fields the firm added before, on any matter type
  onForget: (key: string) => void;
  onChange: (f: FieldDef[]) => void;
  onSave: (f: FieldDef[]) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // Clicking anywhere outside the button or the list closes the list.
  const pickerButton = useRef<HTMLDivElement>(null);
  const pickerList = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (!pickerButton.current?.contains(t) && !pickerList.current?.contains(t)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPickerOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);
  const present = (key: string, label: string) => fields.some((f) => f.key === key || f.label.trim().toLowerCase() === label.toLowerCase());
  const reusable = library.filter((f) => !present(f.key, f.label));
  const addField = (f: FieldDef) => {
    onChange([...fields, { key: f.key, label: f.label }]);
    setPickerOpen(false);
  };
  const set = (i: number, patch: Partial<FieldDef>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const valid = fields.every((f) => f.label.trim());
  return (
    <div className="rounded-xl bg-card-alt p-3.5 flex flex-col gap-2">
      <div className="text-[12.5px] text-muted">
        Fields for <b className="text-ink">{typeName}</b> matters. Changes apply to every {typeName} matter; dates already entered are kept.
      </div>
      {fields.map((f, i) => (
        <div key={f.key} className="flex items-center gap-2">
          <input
            value={f.label}
            onChange={(e) => set(i, { label: e.target.value.slice(0, 60) })}
            aria-label={`Name of field ${i + 1}`}
            className="flex-1 min-w-0 bg-white border border-line rounded-lg px-2.5 py-1.5 text-[13.5px] outline-none"
          />
          <span className="text-[11px] text-muted w-[60px] flex-shrink-0">{f.key.startsWith("c_") ? "Your field" : "Standard"}</span>
          <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="w-7 h-7 rounded-full hover:bg-white disabled:opacity-30 flex items-center justify-center">
            <ArrowUp size={13} />
          </button>
          <button onClick={() => move(i, 1)} disabled={i === fields.length - 1} aria-label="Move down" className="w-7 h-7 rounded-full hover:bg-white disabled:opacity-30 flex items-center justify-center">
            <ArrowDown size={13} />
          </button>
          <button onClick={() => onChange(fields.filter((_, j) => j !== i))} aria-label={`Remove ${f.label}`} className="w-7 h-7 rounded-full hover:bg-white text-muted hover:text-[#B42318] flex items-center justify-center">
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          onClick={() => onChange([...fields, { key: newCustomKey(), label: "" }])}
          disabled={fields.length >= 30}
          className="flex items-center gap-1.5 bg-white hover:bg-chip px-3 py-1.5 rounded-full text-[12.5px] font-medium"
        >
          <Plus size={13} /> Add field
        </button>
        <div className="relative" ref={pickerButton}>
          <button
            onClick={() => setPickerOpen((o) => !o)}
            disabled={fields.length >= 30}
            className="flex items-center gap-1.5 bg-white hover:bg-chip disabled:opacity-50 px-3 py-1.5 rounded-full text-[12.5px] font-medium"
          >
            <History size={13} /> Use a field from before <ChevronDown size={12} />
          </button>
        </div>
      </div>
      {pickerOpen && (
<div ref={pickerList} className="bg-white border border-line rounded-2xl p-1.5 max-w-[360px] max-h-[280px] overflow-y-auto">
                {reusable.length > 0 ? (
                  <div className="px-3 pt-1.5 pb-1 text-[11.5px] font-semibold text-muted">Fields your firm added</div>
                ) : (
                  <div className="px-3 py-2.5 text-[12.5px] text-muted">
                    Nothing here yet. Fields you create with <b className="text-ink">+ Add field</b> are kept here, so you can reuse them on any matter type.
                  </div>
                )}
                {reusable.map((f) => (
                  <div key={f.key} className="flex items-center rounded-xl hover:bg-chip">
                    <button onClick={() => addField(f)} className="flex-1 text-left px-3 py-2 text-[13.5px] truncate">
                      {f.label}
                    </button>
                    <button
                      onClick={() => onForget(f.key)}
                      title="Remove from this list (matter types using it keep it)"
                      aria-label={`Remove ${f.label} from the list`}
                      className="w-7 h-7 mr-1 rounded-full hover:bg-white text-muted hover:text-[#B42318] flex items-center justify-center flex-shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}

              </div>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button onClick={onCancel} disabled={saving} className="ml-auto px-3.5 py-1.5 rounded-full text-[13px] font-medium hover:bg-white">
          Cancel
        </button>
        <button
          onClick={() => onSave(fields.map((f) => ({ ...f, label: f.label.trim() })))}
          disabled={saving || !valid}
          className="flex items-center gap-1.5 bg-btn hover:bg-btn-hover disabled:opacity-50 px-4 py-1.5 rounded-full text-[13px] font-medium"
        >
          {saving && <Loader2 size={12} className="animate-spin" />} Save fields
        </button>
      </div>
      {!valid && <div className="text-[12px] text-[#B42318]">Give every field a name, or remove it.</div>}
    </div>
  );
}
