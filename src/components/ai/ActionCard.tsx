"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, X, Loader2, UserPlus, ListChecks, FileText, ArrowUpRight, BookmarkPlus, AlertTriangle } from "lucide-react";
import type { ActionProposal, MemorySuggestion } from "@/components/ai/types";

const TOOL_META: Record<ActionProposal["tool"], { title: string; icon: typeof UserPlus; open: string }> = {
  createClient: { title: "Create client", icon: UserPlus, open: "Open client" },
  createTask: { title: "Create task", icon: ListChecks, open: "Open task" },
  saveDocumentDraft: { title: "Save draft to matter documents", icon: FileText, open: "Open draft" },
};

function rows(a: ActionProposal): [string, string][] {
  const v = a.args as Record<string, string | undefined>;
  if (a.tool === "createClient")
    return [
      ["Name", v.name ?? ""],
      ["Type", v.type ?? "Individual"],
      ["Email", v.email ?? "—"],
      ["Phone", v.phone ?? "—"],
      ["Address", v.address ?? "—"],
      ["Notes", v.description ?? "—"],
    ];
  if (a.tool === "createTask")
    return [
      ["Title", v.title ?? ""],
      ["Description", v.description ?? "—"],
      ["Priority", v.priority ?? "Medium"],
      ["Due date", v.dueDate ?? "—"],
      ["Assignee", v.assignee ?? "—"],
      ["Matter", a.matterTitle ?? "None (general task)"],
    ];
  return [
    ["Title", v.title ?? ""],
    ["Matter", a.matterTitle ?? ""],
  ];
}

export function ActionCard({ action, onChange }: { action: ActionProposal; onChange: (a: ActionProposal) => void }) {
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);
  const [showDraft, setShowDraft] = useState(false);
  const meta = TOOL_META[action.tool];
  const Icon = meta.icon;

  async function decide(decision: "confirm" | "cancel") {
    setBusy(decision);
    try {
      const res = await fetch(`/api/ai/actions/${action.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === "executed") onChange({ ...action, status: "executed", result: data.result, error: null });
      else if (res.ok && data.status === "cancelled") onChange({ ...action, status: "cancelled" });
      else onChange({ ...action, status: data.status === "failed" ? "failed" : action.status, error: data.error ?? "That didn't work. Please try again." });
    } catch {
      onChange({ ...action, error: "Couldn't reach the server. Nothing was changed." });
    } finally {
      setBusy(null);
    }
  }

  const done = action.status === "executed";
  const closed = action.status === "cancelled" || action.status === "failed";

  return (
    <div className={`mt-3 rounded-2xl border ${done ? "border-[#B9D6B2] bg-[#F1F7EF]" : "border-line bg-white"} overflow-hidden`}>
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
        <Icon size={15} strokeWidth={1.75} className="text-muted" />
        <span className="text-[13.5px] font-semibold">{meta.title}</span>
        <span className={`ml-auto text-[11.5px] font-medium px-2 py-0.5 rounded-full ${
          done ? "bg-[#DCEBD8] text-[#2F5E2A]" : action.status === "pending" ? "bg-[#F5E3B3] text-[#6B5415]" : "bg-card-alt text-muted"
        }`}>
          {done ? "Created" : action.status === "pending" ? "Needs your confirmation" : action.status === "cancelled" ? "Cancelled" : action.status === "failed" ? "Failed" : "Working…"}
        </span>
      </div>
      <dl className="px-4 pb-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-[13px]">
        {rows(action).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="break-words whitespace-pre-wrap">{v}</dd>
          </div>
        ))}
      </dl>
      {action.tool === "saveDocumentDraft" && (
        <div className="px-4 pb-3">
          <button onClick={() => setShowDraft(!showDraft)} className="text-[12.5px] underline underline-offset-2 text-muted hover:text-ink">
            {showDraft ? "Hide draft text" : "Show full draft text"}
          </button>
          {showDraft && (
            <pre className="mt-2 max-h-[260px] overflow-auto whitespace-pre-wrap text-[12.5px] bg-card-alt rounded-xl p-3 font-sans">
              {String(action.args.content ?? "")}
            </pre>
          )}
          <p className="text-[12px] text-muted mt-2">Saved as a PDF headed “DRAFT – AI-generated for attorney review.”</p>
        </div>
      )}
      {action.error && (
        <div className="mx-4 mb-3 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-[12.5px]">
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" /> {action.error}
        </div>
      )}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-line/70">
        {done && action.result ? (
          <Link
            href={action.result.href}
            className="flex items-center gap-1.5 bg-dark text-white px-3.5 py-1.5 rounded-full text-[13px] font-medium hover:bg-dark2"
          >
            {meta.open}: {action.result.label} <ArrowUpRight size={13} />
          </Link>
        ) : closed ? (
          <span className="text-[12.5px] text-muted">{action.status === "cancelled" ? "Nothing was created." : "Nothing was saved."}</span>
        ) : (
          <>
            <button
              onClick={() => decide("confirm")}
              disabled={!!busy}
              className="flex items-center gap-1.5 bg-dark text-white px-3.5 py-1.5 rounded-full text-[13px] font-medium hover:bg-dark2 disabled:opacity-60"
            >
              {busy === "confirm" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Confirm
            </button>
            <button
              onClick={() => decide("cancel")}
              disabled={!!busy}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium text-muted hover:text-ink disabled:opacity-60"
            >
              <X size={13} /> Cancel
            </button>
            <span className="text-[12px] text-muted ml-auto hidden sm:block">Nothing is created until you confirm.</span>
          </>
        )}
      </div>
    </div>
  );
}

const SCOPE_LABEL = { personal: "Personal preference", firm: "Firm information", matter: "Matter fact" } as const;

export function MemorySuggestionCard({
  suggestion,
  conversationId,
  matterId,
  onChange,
}: {
  suggestion: MemorySuggestion;
  conversationId: string | null;
  matterId: string | null;
  onChange: (s: MemorySuggestion) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: suggestion.scope, content: suggestion.content, matterId: suggestion.scope === "matter" ? matterId : null, conversationId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Couldn't save that memory.");
      onChange({ ...suggestion, saved: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (suggestion.dismissed) return null;
  return (
    <div className="mt-3 rounded-2xl border border-dashed border-line bg-cream px-4 py-3">
      <div className="flex items-center gap-2 text-[12.5px] text-muted mb-1">
        <BookmarkPlus size={13} /> Suggested memory · {SCOPE_LABEL[suggestion.scope]}
      </div>
      <div className="text-[13.5px] mb-2.5">{suggestion.content}</div>
      {error && <div className="text-[12.5px] text-red-600 mb-2">{error}</div>}
      {suggestion.saved ? (
        <div className="text-[12.5px] text-[#2F5E2A] flex items-center gap-1.5">
          <Check size={13} /> Saved to memory. You can edit or delete it in the Memory panel.
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={busy} className="bg-dark text-white px-3 py-1 rounded-full text-[12.5px] font-medium hover:bg-dark2 disabled:opacity-60">
            {busy ? "Saving…" : "Save to memory"}
          </button>
          <button onClick={() => onChange({ ...suggestion, dismissed: true })} className="px-3 py-1 rounded-full text-[12.5px] text-muted hover:text-ink">
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
