"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Plus, Pencil, Trash2, Loader2, User, Building2, Folder, Check } from "lucide-react";

type Scope = "personal" | "firm" | "matter";
type Memory = {
  id: string;
  scope: Scope;
  matter_id: string | null;
  content: string;
  enabled: boolean;
  source: "manual" | "suggested";
  source_conversation_id: string | null;
  updated_at: string;
};

const TABS: { key: Scope; label: string; icon: typeof User; blurb: string }[] = [
  { key: "personal", label: "Personal", icon: User, blurb: "Your own preferences. Only you and your conversations use these." },
  { key: "firm", label: "Firm", icon: Building2, blurb: "Firm-wide information, shared with everyone at your firm." },
  { key: "matter", label: "Matter", icon: Folder, blurb: "Facts about this matter. Used only in this matter's conversations." },
];

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function MemoryPanel({
  open,
  onClose,
  matterId,
  matterTitle,
  refreshKey,
}: {
  open: boolean;
  onClose: () => void;
  matterId: string | null;
  matterTitle: string | null;
  refreshKey: number;
}) {
  const [tab, setTab] = useState<Scope>(matterId ? "matter" : "personal");
  const [data, setData] = useState<Record<Scope, Memory[]>>({ personal: [], firm: [], matter: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const fetchAll = useCallback(async () => {
    const res = await fetch(`/api/ai/memories${matterId ? `?matterId=${matterId}` : ""}`);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d?.error ?? "Couldn't load memory.");
    return d as Record<Scope, Memory[]>;
  }, [matterId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchAll()
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, fetchAll, refreshKey]);

  async function call(url: string, method: string, body?: unknown) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d?.error ?? "That didn't work.");
    return d;
  }

  async function reload() {
    try {
      setData(await fetchAll());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function add() {
    if (!draft.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await call("/api/ai/memories", "POST", { scope: tab, content: draft, matterId: tab === "matter" ? matterId : null });
      setDraft("");
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function patch(id: string, body: { content?: string; enabled?: boolean }) {
    setError(null);
    try {
      await call(`/api/ai/memories/${id}`, "PATCH", body);
      setEditingId(null);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this memory? The assistant will stop using it right away.")) return;
    setError(null);
    try {
      await call(`/api/ai/memories/${id}`, "DELETE");
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!open) return null;
  const list = data[tab] ?? [];
  const matterDisabled = tab === "matter" && !matterId;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40 lg:hidden" onClick={onClose} />
      <aside className="fixed lg:static right-0 top-0 bottom-0 z-50 w-full sm:w-[380px] lg:w-[360px] flex-shrink-0 bg-cream border-l border-line flex flex-col h-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div>
            <div className="font-display text-[17px] font-semibold">Memory</div>
            <div className="text-[12.5px] text-muted">What the assistant remembers between conversations</div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close memory">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex gap-1 px-4 pt-3">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                  tab === t.key ? "bg-dark text-white" : "text-muted hover:text-ink hover:bg-card-alt"
                }`}
              >
                <Icon size={13} /> {t.label}
                <span className={`text-[11px] ${tab === t.key ? "text-white/70" : "text-muted"}`}>{data[t.key]?.length ?? 0}</span>
              </button>
            );
          })}
        </div>

        <div className="px-5 pt-3 text-[12.5px] text-muted">
          {tab === "matter" && matterTitle ? (
            <>
              Facts about <span className="text-ink font-medium">{matterTitle}</span>. Used only in this matter&apos;s conversations.
            </>
          ) : (
            TABS.find((t) => t.key === tab)!.blurb
          )}
        </div>

        {matterDisabled ? (
          <div className="m-5 rounded-xl bg-card-alt px-4 py-3 text-[13px] text-muted">Choose a matter in the chat to see and add its facts.</div>
        ) : (
          <div className="px-5 pt-3">
            <div className="bg-white border border-line rounded-xl p-2 focus-within:border-ink">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder={tab === "personal" ? "e.g. Prefer short bullet-point summaries" : tab === "firm" ? "e.g. We bill in 6-minute increments" : "e.g. Hearing is in Cook County Circuit Court"}
                className="w-full bg-transparent outline-none text-[13.5px] resize-none px-1.5"
              />
              <div className="flex items-center justify-between px-1.5">
                <span className="text-[11.5px] text-muted">No passwords, keys or ID numbers.</span>
                <button onClick={add} disabled={adding || !draft.trim()} className="flex items-center gap-1 bg-dark text-white px-3 py-1 rounded-full text-[12.5px] font-medium disabled:opacity-40">
                  {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add
                </button>
              </div>
            </div>
          </div>
        )}

        {error && <div className="mx-5 mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{error}</div>}

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">
          {loading ? (
            <div className="flex items-center gap-2 text-[13px] text-muted py-6 justify-center">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : !matterDisabled && list.length === 0 ? (
            <div className="text-[13px] text-muted text-center py-8">Nothing saved here yet.</div>
          ) : (
            !matterDisabled &&
            list.map((m) => (
              <div key={m.id} className={`rounded-xl border border-line bg-white px-3.5 py-3 ${m.enabled ? "" : "opacity-60"}`}>
                {editingId === m.id ? (
                  <>
                    <textarea
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      maxLength={1000}
                      className="w-full border border-line rounded-lg p-2 text-[13.5px] outline-none focus:border-ink resize-none"
                    />
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => patch(m.id, { content: editText })} className="flex items-center gap-1 bg-dark text-white px-3 py-1 rounded-full text-[12.5px]">
                        <Check size={12} /> Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="px-3 py-1 rounded-full text-[12.5px] text-muted hover:text-ink">
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[13.5px] whitespace-pre-wrap break-words">{m.content}</div>
                    <div className="flex items-center gap-2 mt-2 text-[11.5px] text-muted flex-wrap">
                      <span>{m.source === "suggested" ? "Approved from a chat suggestion" : "Added manually"}</span>
                      <span>·</span>
                      <span>Updated {fmt(m.updated_at)}</span>
                      {!m.enabled && <span className="px-1.5 rounded bg-card-alt">Off</span>}
                      <div className="ml-auto flex items-center gap-1">
                        <label className="flex items-center gap-1 cursor-pointer mr-1" title={m.enabled ? "In use. Click to turn off" : "Turned off. Click to use again"}>
                          <input type="checkbox" checked={m.enabled} onChange={(e) => patch(m.id, { enabled: e.target.checked })} className="accent-black" />
                          Use
                        </label>
                        <button onClick={() => (setEditingId(m.id), setEditText(m.content))} className="p-1 hover:text-ink" aria-label="Edit memory">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => remove(m.id)} className="p-1 hover:text-red-600" aria-label="Delete memory">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
