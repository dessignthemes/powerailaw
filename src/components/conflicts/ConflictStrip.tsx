"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ShieldCheck, ShieldAlert, ShieldQuestion, RefreshCw } from "lucide-react";
import type { ConflictCheck } from "@/lib/conflicts/check";

// On a client card: the client's conflict check against every matter.
// Runs only when someone clicks "Run conflict check" (it uses AI credits), then
// shows the result at a glance with a link to the details.

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export default function ConflictStrip({ clientId, names, ready }: { clientId: string | null; names: string[]; ready: boolean }) {
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

  if (!clientId || setup) return null;

  const base = "mx-6 mt-4 rounded-xl px-4 py-3 flex items-start gap-3 text-[13.5px]";
  if (running || (!check && !loaded))
    return (
      <div className={`${base} bg-white border border-line text-muted`}>
        <Loader2 size={16} className="animate-spin mt-0.5 flex-shrink-0" />
        <span>{running ? "Checking for conflicts across every matter (open, closed and leads)…" : "Loading the conflict check…"}</span>
      </div>
    );
  if (!check)
    return (
      <div className={`${base} bg-white border border-line items-center`}>
        <ShieldQuestion size={16} className="flex-shrink-0 text-muted" />
        <span className="flex-1 text-muted">{error ?? "Not checked for conflicts yet. Checks the client against every matter: leads, open and closed."}</span>
        <button
          onClick={run}
          disabled={!ready}
          title={ready ? undefined : "Add the client's first and last name (or company name) first"}
          className="bg-btn hover:bg-btn-hover px-3.5 py-1.5 rounded-full text-[13px] font-medium flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50"
        >
          <ShieldCheck size={14} /> Run conflict check
        </button>
      </div>
    );

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
        <button onClick={run} disabled={!ready} title="Run the check again" className="flex items-center gap-1 opacity-80 hover:opacity-100 disabled:opacity-40">
          <RefreshCw size={13} /> Run again
        </button>
      </div>
    </div>
  );
}
