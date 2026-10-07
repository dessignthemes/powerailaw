"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X, Sparkles, Loader2, RefreshCw, AlertTriangle, AlertCircle, Info, Check, Plus, CalendarDays, Users, FileText, Clock, ListChecks, ArrowUpRight } from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import type { ReviewResult, Issue, NextStep } from "@/lib/ai/matterReview";

const STATUSES = ["Open", "Lead", "Consultation", "Engaged", "Active", "Closed", "All"] as const;
const cacheKey = (id: string) => `lawpower.aimatter.${id}`;

function readCache(id: string): ReviewResult | null {
  try {
    return JSON.parse(window.localStorage.getItem(cacheKey(id)) ?? "null");
  } catch {
    return null;
  }
}
function writeCache(r: ReviewResult) {
  try {
    window.localStorage.setItem(cacheKey(r.matter.id), JSON.stringify(r));
  } catch {
    // storage full: the review just isn't remembered
  }
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const sevStyle: Record<Issue["severity"], { icon: typeof AlertTriangle; cls: string; label: string }> = {
  high: { icon: AlertTriangle, cls: "bg-[#F9B2B3]", label: "Needs attention" },
  medium: { icon: AlertCircle, cls: "bg-[#F9E1C0]", label: "Should fix" },
  low: { icon: Info, cls: "bg-card-alt border border-line", label: "Worth a look" },
};

export default function AiMatterPage() {
  const { matters, clients, refreshAll } = useWorkspaceData();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("Open");
  const [selected, setSelected] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? "";
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return matters
      .filter((m) => (status === "All" ? true : status === "Open" ? m.status !== "Closed" : m.status === status))
      .filter((m) => words.every((w) => `${m.title} ${clientName(m.clientId)} ${m.category ?? ""} ${m.counterparty ?? ""}`.toLowerCase().includes(w)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matters, clients, q, status]);

  function pick(id: string) {
    setSelected(id);
    setReview(readCache(id));
    setError(null);
    setNotice(null);
    setCreated(new Set());
  }

  async function run(id: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/ai/matter-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matterId: id }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? "The review couldn't be prepared.");
      setReview(d.review);
      writeCache(d.review);
      setCreated(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createTasks(items: { key: string; title: string; description: string; priority: string; dueDate: string | null }[]) {
    if (!selected || !items.length) return;
    try {
      const res = await fetch("/api/ai/matter-review/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matterId: selected, tasks: items.map((t) => ({ title: t.title, description: t.description, priority: t.priority, dueDate: t.dueDate })) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? "The tasks couldn't be created.");
      setCreated((s) => new Set([...s, ...items.map((i) => i.key)]));
      setNotice(`Created ${d.created} task${d.created === 1 ? "" : "s"} on this matter. They're on the Task Board and the matter page.`);
      refreshAll();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const stepItem = (n: NextStep, i: number) => ({ key: `step-${i}`, title: n.title, description: n.why ? `${n.why}\n\nSuggested by AI Matter.` : "Suggested by AI Matter.", priority: n.priority, dueDate: n.dueDate });
  const sel = matters.find((m) => m.id === selected);

  return (
    <div className="px-10 py-10">
      <h1 className="text-[28px] font-semibold">AI Matter</h1>
      <p className="text-[14.5px] text-muted mt-1 mb-6 max-w-[760px]">
        Pick a matter. The AI reads the matter, its client, tasks, documents and time, summarizes where it stands, flags what&apos;s missing, and
        suggests next steps you can turn into tasks.
      </p>

      <div className="grid lg:grid-cols-[340px_1fr] gap-5 items-start">
        {/* Matter list */}
        <div className="bg-card-alt rounded-2xl p-3 lg:sticky lg:top-6">
          <div className="relative mb-2.5">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search matters or clients" aria-label="Search matters" className="w-full border border-line bg-white rounded-full pl-9 pr-8 py-2 text-[13.5px] outline-none focus:border-ink placeholder:text-muted" />
            {q && <button onClick={() => setQ("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"><X size={14} /></button>}
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {STATUSES.map((s) => (
              <button key={s} onClick={() => setStatus(s)} className={`px-2.5 py-1 rounded-full text-[12px] font-medium ${status === s ? "bg-btn ring-1 ring-inset ring-btn-ring" : "bg-white/70 hover:bg-white"}`}>{s}</button>
            ))}
          </div>
          <div className="bg-cream rounded-xl divide-y divide-line max-h-[65vh] overflow-y-auto">
            {shown.length === 0 ? (
              <div className="px-4 py-10 text-center text-[13.5px] text-muted">
                {matters.length === 0 ? <>No matters yet. <Link href="/dashboard/matters" className="underline underline-offset-2">Create one</Link>.</> : "No matters match."}
              </div>
            ) : (
              shown.map((m) => (
                <button key={m.id} onClick={() => pick(m.id)} className={`w-full text-left px-3.5 py-3 ${selected === m.id ? "bg-white" : "hover:bg-white/60"}`}>
                  <div className="text-[13.5px] font-medium truncate">{m.title}</div>
                  <div className="text-[12px] text-muted truncate">{[clientName(m.clientId), m.status, m.category && m.category !== "None" ? m.category : ""].filter(Boolean).join(" · ")}</div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Review */}
        <div className="min-w-0">
          {!sel ? (
            <div className="bg-card-alt rounded-2xl py-20 text-center">
              <Sparkles size={24} strokeWidth={1.5} className="mx-auto mb-3 text-muted" />
              <div className="text-[15px] font-medium">Choose a matter to review</div>
              <div className="text-[13.5px] text-muted mt-1">The summary takes about 10 to 30 seconds.</div>
            </div>
          ) : (
            <div className="grid gap-5">
              <div className="bg-card-alt rounded-2xl p-6 flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[22px] font-semibold">{sel.title}</div>
                  <div className="text-[13.5px] text-muted mt-0.5">{[clientName(sel.clientId) || "No client", sel.status, sel.category && sel.category !== "None" ? sel.category : ""].filter(Boolean).join(" · ")}</div>
                  {review && <div className="text-[12px] text-muted mt-1">Reviewed {new Date(review.generatedAt).toLocaleString()}</div>}
                </div>
                <div className="flex gap-2">
                  <Link href={`/dashboard/matters/${sel.id}`} className="bg-white hover:bg-line/40 border border-line px-3.5 py-2 rounded-full text-[13px] font-medium flex items-center gap-1.5">
                    Open matter <ArrowUpRight size={13} />
                  </Link>
                  <button onClick={() => run(sel.id)} disabled={busy} className="bg-btn hover:bg-btn-hover px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 disabled:opacity-60">
                    {busy ? <Loader2 size={14} className="animate-spin" /> : review ? <RefreshCw size={14} /> : <Sparkles size={14} />}
                    {busy ? "Reviewing…" : review ? "Refresh review" : "Summarize with AI"}
                  </button>
                </div>
              </div>

              {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">{error}</div>}
              {notice && <div className="rounded-xl border border-line bg-card-alt px-4 py-3 text-[13.5px]">{notice}</div>}

              {!review ? (
                !busy && <div className="bg-card-alt rounded-2xl py-14 text-center text-[14px] text-muted">Click “Summarize with AI” to review this matter.</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { icon: ListChecks, label: "Open tasks", value: `${review.stats.openTasks}`, sub: review.stats.overdueTasks ? `${review.stats.overdueTasks} overdue` : "none overdue" },
                      { icon: FileText, label: "Documents", value: `${review.stats.documents}`, sub: `${review.stats.searchableDocuments} readable by AI` },
                      { icon: Clock, label: "Time", value: `${review.stats.totalHours} h`, sub: `${review.stats.billableHours} h billable` },
                      { icon: CalendarDays, label: "Billable value", value: money(review.stats.billableValue), sub: review.matter.dueDate ? `Due ${review.matter.dueDate}` : "No due date" },
                    ].map((s) => (
                      <div key={s.label} className="bg-card-alt rounded-2xl p-4">
                        <div className="flex items-center gap-1.5 text-[12.5px] text-muted"><s.icon size={13} /> {s.label}</div>
                        <div className="text-[22px] font-semibold mt-1 tabular-nums">{s.value}</div>
                        <div className={`text-[12px] ${s.sub.includes("overdue") && !s.sub.startsWith("none") ? "text-red-700" : "text-muted"}`}>{s.sub}</div>
                      </div>
                    ))}
                  </div>

                  {review.ai ? (
                    <div className="bg-card-alt rounded-2xl p-6">
                      <div className="flex items-center gap-2 text-[15px] font-semibold mb-2"><Sparkles size={15} /> Summary</div>
                      <p className="text-[14.5px] leading-relaxed">{review.ai.summary}</p>
                      {review.ai.status && <p className="text-[13.5px] mt-3 bg-white border border-line rounded-xl px-3.5 py-2.5"><span className="font-medium">Status:</span> {review.ai.status}</p>}
                    </div>
                  ) : (
                    review.aiError && <div className="rounded-xl border border-line bg-card-alt px-4 py-3 text-[13.5px]">{review.aiError}</div>
                  )}

                  {/* Issues */}
                  <div className="bg-card-alt rounded-2xl p-6">
                    <div className="text-[15px] font-semibold mb-3">What&apos;s missing or needs fixing</div>
                    {review.issues.length === 0 && !review.ai?.missing.length ? (
                      <div className="flex items-center gap-2 text-[13.5px] text-green-700"><Check size={15} /> No problems found by the automatic checks.</div>
                    ) : (
                      <div className="grid gap-2">
                        {review.issues.map((i) => {
                          const S = sevStyle[i.severity];
                          return (
                            <div key={i.key} className="bg-white border border-line rounded-xl px-4 py-3 flex items-start gap-3 flex-wrap">
                              <span className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${S.cls}`} title={S.label}><S.icon size={14} /></span>
                              <div className="flex-1 min-w-[220px]">
                                <div className="text-[14px] font-medium">{i.title}</div>
                                <div className="text-[13px] text-muted">{i.detail}</div>
                              </div>
                              {i.fix.kind === "link" && i.fix.href ? (
                                <Link href={i.fix.href} className="bg-chip hover:bg-line/70 px-3 py-1.5 rounded-full text-[12.5px] font-medium">{i.fix.label}</Link>
                              ) : i.fix.task ? (
                                <button
                                  disabled={created.has(i.key)}
                                  onClick={() => createTasks([{ key: i.key, title: i.fix.task!.title, description: i.detail, priority: i.fix.task!.priority, dueDate: null }])}
                                  className="bg-btn hover:bg-btn-hover px-3 py-1.5 rounded-full text-[12.5px] font-medium disabled:opacity-50"
                                >
                                  {created.has(i.key) ? "Task created" : i.fix.label}
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                        {review.ai?.missing.map((m, k) => (
                          <div key={`m${k}`} className="bg-white border border-line rounded-xl px-4 py-3 flex items-start gap-3 flex-wrap">
                            <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-card-alt border border-line" title="Spotted by AI"><Sparkles size={13} /></span>
                            <div className="flex-1 min-w-[220px] text-[13.5px]">{m}</div>
                            <button
                              disabled={created.has(`miss-${k}`)}
                              onClick={() => createTasks([{ key: `miss-${k}`, title: `Get: ${m.slice(0, 120)}`, description: `${m}\n\nSpotted by AI Matter.`, priority: "Medium", dueDate: null }])}
                              className="bg-chip hover:bg-line/70 px-3 py-1.5 rounded-full text-[12.5px] font-medium disabled:opacity-50"
                            >
                              {created.has(`miss-${k}`) ? "Task created" : "Create task"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {review.ai && review.ai.nextSteps.length > 0 && (
                    <div className="bg-card-alt rounded-2xl p-6">
                      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                        <div className="text-[15px] font-semibold">Suggested next steps</div>
                        <button
                          onClick={() => createTasks(review.ai!.nextSteps.map(stepItem).filter((x) => !created.has(x.key)))}
                          disabled={review.ai.nextSteps.every((_, i) => created.has(`step-${i}`))}
                          className="bg-btn hover:bg-btn-hover px-3.5 py-1.5 rounded-full text-[13px] font-medium flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <Plus size={13} /> Create all as tasks
                        </button>
                      </div>
                      <div className="grid gap-2">
                        {review.ai.nextSteps.map((n, i) => (
                          <div key={i} className="bg-white border border-line rounded-xl px-4 py-3 flex items-start gap-3 flex-wrap">
                            <div className="flex-1 min-w-[220px]">
                              <div className="text-[14px] font-medium">{n.title}</div>
                              <div className="text-[12.5px] text-muted">{[n.why, n.dueDate ? `by ${n.dueDate}` : ""].filter(Boolean).join(" · ")}</div>
                            </div>
                            <span className={`text-[12px] px-2 py-0.5 rounded-full ${n.priority === "High" ? "bg-[#F9B2B3]" : n.priority === "Low" ? "bg-[#CAF0D9]" : "bg-[#F9E1C0]"}`}>{n.priority}</span>
                            <button onClick={() => createTasks([stepItem(n, i)])} disabled={created.has(`step-${i}`)} className="bg-chip hover:bg-line/70 px-3 py-1.5 rounded-full text-[12.5px] font-medium disabled:opacity-50">
                              {created.has(`step-${i}`) ? "Task created" : "Create task"}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {review.ai && (
                    <div className="grid md:grid-cols-2 gap-5">
                      <div className="bg-card-alt rounded-2xl p-6">
                        <div className="flex items-center gap-2 text-[15px] font-semibold mb-3"><CalendarDays size={15} /> Key dates</div>
                        {review.ai.keyDates.length ? (
                          <ul className="grid gap-1.5 text-[13.5px]">{review.ai.keyDates.map((d, i) => <li key={i}><span className="font-medium tabular-nums">{d.date}</span> · {d.label}</li>)}</ul>
                        ) : <div className="text-[13.5px] text-muted">None found.</div>}
                      </div>
                      <div className="bg-card-alt rounded-2xl p-6">
                        <div className="flex items-center gap-2 text-[15px] font-semibold mb-3"><Users size={15} /> Parties</div>
                        {review.ai.parties.length ? (
                          <ul className="grid gap-1.5 text-[13.5px]">{review.ai.parties.map((p, i) => <li key={i}><span className="font-medium">{p.name}</span>{p.role ? ` · ${p.role}` : ""}</li>)}</ul>
                        ) : <div className="text-[13.5px] text-muted">None found.</div>}
                      </div>
                      <div className="bg-card-alt rounded-2xl p-6">
                        <div className="text-[15px] font-semibold mb-3">Key facts</div>
                        {review.ai.keyFacts.length ? (
                          <ul className="grid gap-2 text-[13.5px] list-disc pl-5">
                            {review.ai.keyFacts.map((f, i) => {
                              const src = review.sources.find((s) => s.id === f.source);
                              return <li key={i}>{f.fact}{src && <span className="text-[12px] text-muted"> ({src.name}{src.page ? `, p. ${src.page}` : ""})</span>}</li>;
                            })}
                          </ul>
                        ) : <div className="text-[13.5px] text-muted">None found.</div>}
                      </div>
                      <div className="bg-card-alt rounded-2xl p-6">
                        <div className="text-[15px] font-semibold mb-3">Risks</div>
                        {review.ai.risks.length ? (
                          <ul className="grid gap-2 text-[13.5px] list-disc pl-5">{review.ai.risks.map((r, i) => <li key={i}>{r}</li>)}</ul>
                        ) : <div className="text-[13.5px] text-muted">None flagged.</div>}
                      </div>
                    </div>
                  )}
                  <p className="text-[12px] text-muted">
                    The matter, client, tasks, time and relevant document excerpts are sent to the AI provider to prepare this review. AI can be wrong; check
                    important details. The review is remembered in this browser.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
