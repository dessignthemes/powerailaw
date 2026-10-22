"use client";

import { useEffect, useState } from "react";
import { Loader2, Send, CheckCircle2, AlertTriangle } from "lucide-react";

type Settings = { digest: boolean; digestHour: number; digestDays: "weekdays" | "daily"; assignEmails: boolean };
type Person = { id: string; email: string | null; name: string | null; role: string; digest: boolean; canSend: boolean };

const HOURS = [6, 7, 8, 9, 10, 11];

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0 ${on ? "bg-ink" : "bg-btn"}`}>
      <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-[left] ${on ? "left-[21px]" : "left-[3px]"}`} />
    </button>
  );
}

// Administration → Email notifications: the 9 AM check-in and task assignment emails.
export default function NotificationsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [lastDigest, setLastDigest] = useState<{ at: string; sent: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<"digest" | "assignment" | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/admin/notifications")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error ?? "Couldn't load the email settings.");
        return d;
      })
      .then((d) => live && (setSettings(d.settings), setPeople(d.people ?? []), setLastDigest(d.lastDigest ?? null)))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  async function save(patch: { settings?: Settings; person?: { id: string; digest: boolean } }) {
    setError(null);
    const res = await fetch("/api/admin/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setError(d?.error ?? "Couldn't save.");
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }
  const update = (p: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...p };
    setSettings(next);
    void save({ settings: next });
  };

  async function test(kind: "digest" | "assignment") {
    setTesting(kind);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ test: kind }) });
      const d = await res.json().catch(() => ({}));
      setTestResult(res.ok ? { ok: true, text: `Test sent to ${d.to}. Check your inbox in a minute.` } : { ok: false, text: d?.error ?? "The test couldn't be sent." });
    } finally {
      setTesting(null);
    }
  }

  const hourLabel = (h: number) => `${h}:00 AM`;
  const notReady = people.filter((p) => !p.canSend).length;

  return (
    <>
      <h2 className="text-[26px] font-semibold mt-1 mb-1.5">Email notifications</h2>
      <p className="text-[14px] text-muted mb-6 max-w-[680px]">
        Emails LawPower sends to the team: a morning check-in to open the dashboard, and an email when a task is assigned. They go out through your own Outlook / Gmail,
        free.
      </p>
      {error && <div className="mb-4 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3 text-[13.5px]">{error}</div>}
      {!settings ? (
        !error && (
          <div className="text-[14px] text-muted flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        )
      ) : (
        <div className="flex flex-col gap-4 max-w-[760px]">
          <div className="border border-line rounded-2xl p-5 bg-white">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="text-[15px] font-semibold">Morning check-in</div>
                <p className="text-[13px] text-muted mt-0.5">One email per person: overdue tasks, what&apos;s due today, clients waiting for a reply, and matter deadlines this week, with a button to open LawPower.</p>
              </div>
              <Switch on={settings.digest} onChange={(v) => update({ digest: v })} label="Morning check-in" />
            </div>
            {settings.digest && (
              <div className="mt-3 text-[12.5px] text-muted">
                {lastDigest
                  ? `Last sent ${new Date(lastDigest.at).toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" })} to ${lastDigest.sent} ${lastDigest.sent === 1 ? "person" : "people"}${lastDigest.failed ? `; ${lastDigest.failed} couldn't be reached (retried at the next hour)` : ""}.`
                  : "Not sent yet. The first check-in goes out at the next chosen time."}
              </div>
            )}
            {settings.digest && (
              <div className="flex flex-wrap items-center gap-3 mt-4 text-[13.5px]">
                <label className="flex items-center gap-2">
                  Send at
                  <select value={settings.digestHour} onChange={(e) => update({ digestHour: Number(e.target.value) })} className="bg-white border border-line rounded-lg px-2.5 py-1.5 outline-none">
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {hourLabel(h)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  on
                  <select value={settings.digestDays} onChange={(e) => update({ digestDays: e.target.value as Settings["digestDays"] })} className="bg-white border border-line rounded-lg px-2.5 py-1.5 outline-none">
                    <option value="weekdays">weekdays (Mon–Fri)</option>
                    <option value="daily">every day</option>
                  </select>
                </label>
                <span className="text-muted">New Jersey time</span>
                <button onClick={() => void test("digest")} disabled={!!testing} className="ml-auto flex items-center gap-1.5 bg-chip hover:bg-btn disabled:opacity-50 px-3.5 py-1.5 rounded-full text-[13px] font-medium">
                  {testing === "digest" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send me a test
                </button>
              </div>
            )}
          </div>

          <div className="border border-line rounded-2xl p-5 bg-white">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="text-[15px] font-semibold">Task assignment emails</div>
                <p className="text-[13px] text-muted mt-0.5">When someone assigns a task (or a matter) to a colleague, the colleague gets an email from them with the task, due date and a link to open it.</p>
              </div>
              <Switch on={settings.assignEmails} onChange={(v) => update({ assignEmails: v })} label="Task assignment emails" />
            </div>
            {settings.assignEmails && (
              <div className="flex mt-3">
                <button onClick={() => void test("assignment")} disabled={!!testing} className="ml-auto flex items-center gap-1.5 bg-chip hover:bg-btn disabled:opacity-50 px-3.5 py-1.5 rounded-full text-[13px] font-medium">
                  {testing === "assignment" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send me a test
                </button>
              </div>
            )}
          </div>

          {testResult && (
            <div className={`rounded-xl px-4 py-3 text-[13.5px] flex items-center gap-2 ${testResult.ok ? "bg-[#E7F6EE] text-[#155C3A]" : "bg-[#FDECEC] text-[#9F1D1D]"}`}>
              {testResult.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} {testResult.text}
            </div>
          )}

          <div className="border border-line rounded-2xl bg-white overflow-hidden">
            <div className="px-5 pt-4 pb-2">
              <div className="text-[15px] font-semibold">Who gets the morning check-in</div>
              <p className="text-[13px] text-muted mt-0.5">
                Each person&apos;s check-in is sent from their own mailbox to themselves, so each person needs to reconnect Outlook once with “Send email”.
                {notReady > 0 && ` ${notReady} ${notReady === 1 ? "person hasn't" : "people haven't"} yet.`}
              </p>
            </div>
            {people.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-2.5 border-t border-line text-[14px]">
                <span className="flex-1 min-w-0 truncate">
                  {p.name ? `${p.name} · ` : ""}
                  <span className={p.name ? "text-muted" : ""}>{p.email}</span>
                </span>
                {p.canSend ? (
                  <span className="text-[12px] text-[#155C3A] bg-[#E7F6EE] rounded-full px-2 py-0.5">Can send</span>
                ) : (
                  <span className="text-[12px] text-[#8A4B14] bg-[#FDF1E7] rounded-full px-2 py-0.5" title="Needs to reconnect Outlook once (Inbox → Reconnect Outlook) and keep “Send email” ticked">
                    Needs to reconnect Outlook
                  </span>
                )}
                <Switch
                  on={p.digest}
                  label={`Morning check-in for ${p.email}`}
                  onChange={(v) => {
                    setPeople((xs) => xs.map((x) => (x.id === p.id ? { ...x, digest: v } : x)));
                    void save({ person: { id: p.id, digest: v } });
                  }}
                />
              </div>
            ))}
          </div>
          <div className="text-[12.5px] text-muted h-4">{saved ? "Saved." : ""}</div>
        </div>
      )}
    </>
  );
}
