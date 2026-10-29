"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

type Usage = {
  month: string;
  total: number;
  requests: number;
  allowance: number;
  byFeature: { feature: string; tokens: number }[];
  byPerson: { id: string; name: string; tokens: number; today?: { requests: number; tokens: number } }[] | null;
  dailyLimit?: { tokens: number; requests: number };
};

const FEATURE_INFO: Record<string, { label: string; desc: string }> = {
  documents: { label: "Email & document reading", desc: "Key dates and Fill from documents, reading contracts and scanned documents" },
  chat: { label: "AI Agent", desc: "Questions asked of the workspace" },
  matter_review: { label: "AI Matter", desc: "Matter reviews: summary, risks and next steps" },
  accounting: { label: "AI Accountant", desc: "Categorizing bank imports and reading receipts" },
  other: { label: "Other", desc: "Other AI requests" },
};

const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString());
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

// Administration > AI usage: the firm's real AI usage, month by month.
export default function AiUsagePanel() {
  const [month, setMonth] = useState(() => ym(new Date()));
  const [data, setData] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  async function resetLimit(id: string, name: string) {
    setResetting(id);
    try {
      const r = await fetch("/api/admin/ai-usage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resetUserId: id }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? "Couldn't reset.");
      setError(null);
      setReload((n) => n + 1);
      alert(`${name} can use the AI again today. Nothing was deleted; the monthly totals are unchanged.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setResetting(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/ai-usage?month=${month}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error ?? "AI usage couldn't be loaded.");
        return d as Usage;
      })
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [month, reload]);

  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    setData(null);
    setMonth(ym(new Date(y, m - 1 + n, 1)));
  };
  const isCurrent = month === ym(new Date());
  const label = new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const pct = data && data.allowance ? Math.min(100, (data.total / data.allowance) * 100) : 0;
  const pctText = pct > 0 && pct < 1 ? "under 1%" : `${Math.round(pct)}%`;

  return (
    <>
      <h2 className="text-[26px] font-semibold mt-1 mb-1.5">AI usage</h2>
      <p className="text-[14px] text-muted mb-6">What the firm&apos;s AI allowance went on, month by month</p>

      {error ? (
        <div className="rounded-xl bg-[#FDECEE] text-[#9B1C2C] px-4 py-3 text-[13.5px]">{error}</div>
      ) : (
        <>
          {isCurrent && (
            <div className="border border-line rounded-2xl p-5 mb-8">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[15px] font-semibold">Allowance this month</div>
                <span className="text-[14px] font-semibold">{data ? pctText : "…"}</span>
              </div>
              <div className="w-full h-2 bg-card-alt rounded-full overflow-hidden mb-3">
                <div className={`h-full rounded-full ${pct >= 90 ? "bg-[#B42318]" : "bg-dark"}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[13.5px] text-muted">
                {data
                  ? `${fmt(data.total)} of ${fmt(data.allowance)} tokens used. ${pct >= 90 ? "Nearly used up for this month." : pct >= 70 ? "Most of this month's allowance is used." : "Well within this month's allowance."}`
                  : "Loading…"}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <div className="text-[16px] font-semibold">{label}</div>
            <div className="flex items-center gap-1">
              <button onClick={() => shift(-1)} aria-label="Previous month" className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-chip">
                <ChevronLeft size={16} strokeWidth={1.75} />
              </button>
              <button
                onClick={() => shift(1)}
                disabled={isCurrent}
                aria-label="Next month"
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-chip disabled:text-muted-light disabled:hover:bg-transparent disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} strokeWidth={1.75} />
              </button>
            </div>
          </div>

          <div className="border border-line rounded-2xl p-5 flex flex-col gap-5 mb-3">
            {!data ? (
              <div className="flex items-center gap-2 text-[13.5px] text-muted">
                <Loader2 size={14} className="animate-spin" /> Loading usage…
              </div>
            ) : data.total === 0 ? (
              <div className="text-[13.5px] text-muted">No AI was used in {label}.</div>
            ) : (
              <>
                {data.byFeature.map((f) => {
                  const info = FEATURE_INFO[f.feature] ?? FEATURE_INFO.other;
                  const share = Math.round((f.tokens / data.total) * 100);
                  return (
                    <div key={f.feature}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-[14.5px] font-semibold">{info.label}</div>
                        <span className="text-[13.5px] text-muted">
                          <span className="font-semibold text-ink">{fmt(f.tokens)} tokens</span> {share}%
                        </span>
                      </div>
                      <p className="text-[13px] text-muted mb-2">{info.desc}</p>
                      <div className="w-full h-1.5 bg-card-alt rounded-full overflow-hidden">
                        <div className="h-full bg-dark rounded-full" style={{ width: `${Math.max(2, share)}%` }} />
                      </div>
                    </div>
                  );
                })}
                <div className="text-[13.5px] text-muted pt-1">
                  {fmt(data.total)} tokens in {label} · {data.requests.toLocaleString()} AI {data.requests === 1 ? "request" : "requests"}
                </div>
              </>
            )}
          </div>

          {data?.byPerson && data.byPerson.length > 0 && (
            <div className="border border-line rounded-2xl p-5 mt-5 mb-3">
              <div className="text-[14.5px] font-semibold mb-3">By person</div>
              <div className="flex flex-col gap-2">
                {data.byPerson.map((p) => {
                  const lim = data.dailyLimit;
                  const today = p.today;
                  const blocked = !!(lim && today && (today.tokens >= lim.tokens || today.requests >= lim.requests));
                  return (
                    <div key={p.id} className="flex items-center gap-3 text-[13.5px]">
                      <span className="truncate flex-1 min-w-0">{p.name}</span>
                      {lim && today && (
                        <span className={`text-[12.5px] whitespace-nowrap ${blocked ? "text-[#B42318] font-medium" : "text-muted"}`}>
                          Today {fmt(today.tokens)} of {fmt(lim.tokens)}
                          {blocked ? " · limit reached" : ""}
                        </span>
                      )}
                      <button
                        onClick={() => void resetLimit(p.id, p.name)}
                        disabled={resetting === p.id}
                        title="Let this person keep using the AI today (nothing is deleted)"
                        className="text-[12.5px] font-medium bg-chip hover:bg-btn px-2.5 py-1 rounded-full whitespace-nowrap disabled:opacity-50"
                      >
                        {resetting === p.id ? "Resetting…" : "Reset today's limit"}
                      </button>
                      <span className="text-muted whitespace-nowrap w-[120px] text-right">
                        <span className="font-semibold text-ink">{fmt(p.tokens)}</span> · {Math.round((p.tokens / data.total) * 100)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-[13px] text-muted mt-3">Tokens are the metered unit of AI reading and writing; a page of text is roughly 500.</p>
        </>
      )}
    </>
  );
}
