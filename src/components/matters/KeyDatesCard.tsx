"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, Loader2, RefreshCw, RotateCcw, FileText, ChevronDown, ChevronRight, Info, PenLine } from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import { DOCS_CHANGED_EVENT } from "@/components/documents/DocumentsLibrary";
import { KEY_DATE_FIELDS, ruleText, usDate, isRealEstate, type KeyDatesState, type KeyDateField } from "@/lib/matters/keyDates";
import type { Matter } from "@/components/NewMatterModal";

type Result = { state: KeyDatesState; stale: boolean; ran: boolean; error?: string | null; linked?: number };

async function call(url: string, init?: RequestInit): Promise<Result> {
  const res = await fetch(url, init);
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (!d?.error && (res.status === 504 || res.status === 502)) {
      throw new Error("Reading the documents took too long. Click Read documents again: documents already read are kept, so the next try is faster.");
    }
    throw new Error(d?.error ?? "Something went wrong. Please try again.");
  }
  return d as Result;
}

// Key dates of a matter, kept up to date while the matter page is open:
// when documents change, a real estate matter's documents are read again.
export function useKeyDates(matter: Matter | null) {
  const { refreshAll } = useWorkspaceData();
  const [data, setData] = useState<Result | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      setError((e as Error).message);
    } finally {
      busy.current = false;
      setReading(false);
    }
  }, [id, refreshAll]);

  // Saved dates; if the documents changed, a real estate matter's documents are read again.
  const handle = useCallback(
    (r: Result) => {
      setData(r);
      setError(r.error ?? null);
      if (r.linked) refreshAll(); // older tasks were just linked to this matter
      const running = r.state.runningSince && Date.now() - Date.parse(r.state.runningSince) < 150_000;
      if (r.stale && auto && !running) void refresh();
    },
    [auto, refresh, refreshAll]
  );

  useEffect(() => {
    if (!id) return;
    let live = true;
    const load = () =>
      call(`/api/matters/${id}/key-dates`)
        .then((r) => live && handle(r))
        .catch((e: Error) => live && setError(e.message));
    load();
    const onDocs = (e: Event) => {
      if ((e as CustomEvent<{ matterId: string }>).detail?.matterId === id) load();
    };
    window.addEventListener(DOCS_CHANGED_EVENT, onDocs);
    return () => {
      live = false;
      window.removeEventListener(DOCS_CHANGED_EVENT, onDocs);
    };
  }, [id, handle]);

  const save = useCallback(
    async (changes: Partial<Record<KeyDateField, string | null>>) => { // "na" = not applicable (mortgage)
      if (!id) return;
      setError(null);
      try {
        setData(await call(`/api/matters/${id}/key-dates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", dates: changes }) }));
        refreshAll();
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [id, refreshAll]
  );

  const reset = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      setData(await call(`/api/matters/${id}/key-dates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset" }) }));
      refreshAll();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id, refreshAll]);

  const createLetter = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      setData(await call(`/api/matters/${id}/key-dates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "letter" }) }));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  return { data, reading, error, refresh, save, reset, createLetter };
}

export type KeyDatesApi = ReturnType<typeof useKeyDates>;

export default function KeyDatesCard({ api, onOpenDocuments }: { api: KeyDatesApi; onOpenDocuments: () => void }) {
  const { data, reading, error, refresh, save, reset, createLetter } = api;
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
            className="ml-auto flex items-center gap-1.5 bg-chip hover:bg-btn disabled:opacity-50 px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors"
          >
            {resetting ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} strokeWidth={1.75} />} Reset
          </button>
        )}
        <button
          onClick={() => void refresh()}
          disabled={reading}
          className={`${manualCount > 0 ? "" : "ml-auto "}flex items-center gap-1.5 bg-chip hover:bg-btn disabled:opacity-50 px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors`}
        >
          {reading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} strokeWidth={1.75} />}
          {state?.extractedAt ? "Read documents again" : "Read from documents"}
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {error && <div className="rounded-xl bg-[#FDF1E7] text-[#8A4B14] px-3.5 py-2.5 text-[13px]">{error}</div>}
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
          {KEY_DATE_FIELDS.map((f, i) => {
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

        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-card-alt px-3.5 py-2.5 text-[13px]">
          <FileText size={14} strokeWidth={1.75} className="text-muted" />
          <span className="font-medium">Contingency Dates Letter:</span>
          {state?.letter ? (
            <>
              <span className="text-muted">
                created {new Date(state.letter.generatedAt).toLocaleDateString()}
                {state.letter.version > 1 ? ` (version ${state.letter.version})` : ""}
              </span>
              <button onClick={onOpenDocuments} className="font-medium underline underline-offset-2">
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
