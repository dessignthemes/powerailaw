"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import type { ConflictCheck } from "@/lib/conflicts/check";

// On a client card: the client's conflict check against every matter.
// Runs only when someone clicks "Run conflict check" at the top of the page (it
// uses AI credits); the result shows on the card with a link to the details.

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export type ConflictState = ReturnType<typeof useConflictCheck>;

// The client's latest conflict check, and running a new one.
export function useConflictCheck(clientId: string | null, names: string[]) {
  const [check, setCheck] = useState<ConflictCheck | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const key = names.map(norm).filter(Boolean).sort().join("|");

  useEffect(() => {
    if (!clientId) return;
    let live = true;
    fetch(`/api/conflicts?clientId=${clientId}`)
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as { checks?: ConflictCheck[]; code?: string };
        if (!live) return;
        if (d.code === "setup") setSetup(true);
        setCheck(d.checks?.[0] ?? null);
      })
      .catch(() => undefined)
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [clientId]);

  const run = useCallback(async () => {
    if (!clientId) return;
    setRunning(true);
    setError(null);
    try {
      const r = await fetch("/api/conflicts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId }) });
      const d = (await r.json().catch(() => ({}))) as { check?: ConflictCheck; error?: string; code?: string };
      if (d.code === "setup") setSetup(true);
      if (!r.ok || !d.check) throw new Error(d.error ?? "The conflict check couldn't be run.");
      setCheck(d.check);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [clientId]);

  // Checks only run when someone clicks the button (each run uses AI credits).
  // If the name changed since the last check, say so.
  const checked = new Set([...(check?.searched.names ?? []), ...(check?.searched.companies ?? [])].map(norm));
  const stale = !!check && !!key && !key.split("|").every((n) => checked.has(n));

  return { clientId, check, loaded, running, error, setup, stale, run };
}

// The button (shown at the top of the page, next to the page name).
export function ConflictRunButton({ state, ready }: { state: ConflictState; ready: boolean }) {
  if (!state.clientId || state.setup) return null;
  return (
    <button
      onClick={state.run}
      disabled={!ready || state.running}
      title={ready ? "Check this client against every matter: leads, open and closed (uses AI credits)" : "Add the client's first and last name (or company name) first"}
      className="bg-chip hover:bg-btn px-3.5 py-2 rounded-full text-[13px] font-medium flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
    >
      {state.running ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
      {state.check ? "Run conflict check again" : "Run conflict check"}
    </button>
  );
}

// The result, on the client card. Nothing until a check has been run.
export function ConflictResultBar({ state }: { state: ConflictState }) {
  const { clientId, check, running, error, setup, stale } = state;
  if (!clientId || setup) return null;
  const base = "mx-6 mt-4 rounded-xl px-4 py-3 flex items-start gap-3 text-[13.5px]";
  if (running)
    return (
      <div className={`${base} bg-white border border-line text-muted`}>
        <Loader2 size={16} className="animate-spin mt-0.5 flex-shrink-0" />
        <span>Checking for conflicts across every matter (open, closed and leads)…</span>
      </div>
    );
  if (error)
    return (
      <div className={`${base} bg-[#FDECEC] border border-[#F3C2C2] text-[#9F1D1D]`}>
        <ShieldQuestion size={16} className="mt-0.5 flex-shrink-0" />
        <span>{error}</span>
      </div>
    );
  if (!check) return null;
  const decided = check.decision;
  const tone =
    decided === "cleared" || (!decided && check.result === "clear")
      ? { box: "bg-[#F1F7EF] border-[#B9D6B2] text-[#2F5E2A]", Icon: ShieldCheck }
      : decided === "conflict" || check.result === "conflict"
        ? { box: "bg-[#FDECEC] border-[#F3C2C2] text-[#9F1D1D]", Icon: ShieldAlert }
        : { box: "bg-[#FFF4E5] border-[#F5D9B0] text-[#8A4B14]", Icon: ShieldAlert };
  const adverse = check.hits.filter((h) => h.verdict === "adverse").length;
  const title =
    decided === "cleared"
      ? "Conflict check cleared"
      : decided === "conflict"
        ? "Marked as a conflict"
        : check.result === "clear"
          ? "No conflicts found"
          : check.result === "conflict"
            ? "Likely conflict"
            : `Possible conflict: ${check.hits.length} ${check.hits.length === 1 ? "match" : "matches"} to review`;
  const when = new Date(check.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <div className={`${base} border ${tone.box}`}>
      <tone.Icon size={17} className="mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold">{title}</div>
        <div className="text-[13px] opacity-90">
          {check.summary || (adverse ? `${adverse} on the other side of a matter.` : "")}
          <span className="opacity-75">
            {" "}
            · {check.mattersChecked} matters checked {when}
            {!check.aiUsed && check.hits.length > 0 ? " · without AI review" : ""}
          </span>
          {stale && <div className="mt-1 font-medium">The name has changed since this check. Run it again to check the new name.</div>}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 text-[13px] font-medium">
        <Link href={`/dashboard/conflict-checks?check=${check.id}`} className="underline underline-offset-2">
          {check.hits.length ? "Review" : "Details"}
        </Link>
      </div>
    </div>
  );
}
