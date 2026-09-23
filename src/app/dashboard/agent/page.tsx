"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Sparkles,
  SquarePen,
  History,
  Plus,
  Folder,
  ChevronDown,
  ArrowUp,
  CornerDownRight,
  Square,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  Paperclip,
  X,
  Brain,
  Trash2,
  Pencil,
  FileText,
  Search,
  Layers,
  KeyRound,
} from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import { createClient } from "@/lib/supabase/client";
import Markdown from "@/components/ai/Markdown";
import MemoryPanel from "@/components/ai/MemoryPanel";
import { ActionCard, MemorySuggestionCard } from "@/components/ai/ActionCard";
import {
  citationLabel,
  type ActionProposal,
  type AttachedFile,
  type ChatMessage,
  type Citation,
  type ConversationSummary,
  type MemorySuggestion,
  type MessageEvent,
} from "@/components/ai/types";

const SUGGESTIONS: { text: string; needsMatter?: boolean }[] = [
  { text: "Summarize this matter.", needsMatter: true },
  { text: "Review this document." },
  { text: "Draft a client update.", needsMatter: true },
  { text: "Show outstanding tasks." },
  { text: "Create a client." },
];

const TOOL_ACTIVITY: Record<string, string> = {
  searchDocuments: "Searching documents",
  getMatterSummary: "Reading the matter",
  listMatterTasks: "Checking tasks",
  createClient: "Preparing a proposal",
  createTask: "Preparing a proposal",
  saveDocumentDraft: "Preparing a draft",
  suggestMemory: "Suggesting a memory",
};

type Status = { configured: boolean; model: string; usage: { requests: number; tokens: number; requestLimit: number; tokenLimit: number } };
type Problem = { message: string; code?: string };

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error ?? "Something went wrong."), { code: data?.code });
  return data as T;
}

function fileKind(name: string) {
  return /\.pdf$/i.test(name) ? "PDF" : /\.docx$/i.test(name) ? "Word" : "Text";
}

export default function AgentPage() {
  return (
    <Suspense fallback={null}>
      <Agent />
    </Suspense>
  );
}

function Agent() {
  const router = useRouter();
  const search = useSearchParams();
  const urlConv = search.get("c");
  const { matters, refreshAll } = useWorkspaceData();

  const [status, setStatus] = useState<Status | null>(null);
  const [statusProblem, setStatusProblem] = useState<Problem | null>(null);

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryRefresh, setMemoryRefresh] = useState(0);

  const [convId, setConvId] = useState<string | null>(null);
  const [convTitle, setConvTitle] = useState<string>("New chat");
  const [matterId, setMatterId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [pendingFileIds, setPendingFileIds] = useState<string[]>([]);
  const [loadingConv, setLoadingConv] = useState(false);
  const [convError, setConvError] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  const matter = matters.find((m) => m.id === matterId) ?? null;
  const uploading = files.some((f) => f.status === "uploading" || f.status === "processing");

  // Fill the viewport under the dashboard header.
  useEffect(() => {
    const fit = () => {
      const top = rootRef.current?.getBoundingClientRect().top ?? 0;
      setHeight(Math.max(480, window.innerHeight - top - window.scrollY));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    getJson<Status>("/api/ai/status")
      .then(setStatus)
      .catch((e: Error & { code?: string }) => setStatusProblem({ message: e.message, code: e.code }));
    getJson<{ conversations: ConversationSummary[] }>("/api/ai/conversations")
      .then((d) => setConversations(d.conversations))
      .catch(() => {});
  }, []);

  const reloadHistory = useCallback(() => {
    getJson<{ conversations: ConversationSummary[] }>("/api/ai/conversations")
      .then((d) => setConversations(d.conversations))
      .catch(() => {});
  }, []);

  // Open the conversation named in the URL (so refreshes keep your place).
  useEffect(() => {
    if (!urlConv || urlConv === convId) return;
    let cancelled = false;
    getJson<{
      conversation: { id: string; title: string; matterId: string | null };
      messages: ChatMessage[];
      files: AttachedFile[];
      actions: { id: string; status: ActionProposal["status"]; result: ActionProposal["result"]; error: string | null }[];
    }>(`/api/ai/conversations/${urlConv}`)
      .then((d) => {
        if (cancelled) return;
        const byId = new Map(d.actions.map((a) => [a.id, a]));
        setConvId(d.conversation.id);
        setConvTitle(d.conversation.title);
        setMatterId(d.conversation.matterId);
        setFiles(d.files);
        setPendingFileIds([]);
        setMessages(
          d.messages.map((m) => ({
            ...m,
            events: (m.events ?? []).map((e) =>
              e.type === "action" && byId.has(e.action.id)
                ? { ...e, action: { ...e.action, status: byId.get(e.action.id)!.status, result: byId.get(e.action.id)!.result, error: byId.get(e.action.id)!.error } }
                : e
            ),
          }))
        );
        setConvError(null);
      })
      .catch((e: Error) => !cancelled && setConvError(e.message))
      .finally(() => !cancelled && setLoadingConv(false));
    return () => {
      cancelled = true;
    };
  }, [urlConv, convId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: streaming ? "auto" : "smooth" });
  }, [messages, streaming]);

  function newChat(nextMatter: string | null = matterId) {
    abortRef.current?.abort();
    setConvId(null);
    setConvTitle("New chat");
    setMatterId(nextMatter);
    setMessages([]);
    setFiles([]);
    setPendingFileIds([]);
    setConvError(null);
    setHistoryOpen(false);
    router.replace("/dashboard/agent");
    setTimeout(() => textRef.current?.focus(), 30);
  }

  function openConversation(id: string) {
    if (id === convId) return setHistoryOpen(false);
    abortRef.current?.abort();
    setLoadingConv(true);
    setMessages([]);
    setHistoryOpen(false);
    router.replace(`/dashboard/agent?c=${id}`);
  }

  // Each conversation belongs to one matter. Switching matter starts a new one.
  function chooseMatter(id: string | null) {
    if (id === matterId) return;
    if (convId || messages.length) {
      newChat(id);
      setNotice(id ? `Started a new conversation for ${matters.find((m) => m.id === id)?.title ?? "this matter"}.` : "Started a new general conversation.");
      setTimeout(() => setNotice(null), 3500);
    } else setMatterId(id);
  }

  async function ensureConversation(): Promise<string> {
    if (convId) return convId;
    const d = await getJson<{ conversation: { id: string; title: string } }>("/api/ai/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matterId }),
    });
    setConvId(d.conversation.id);
    router.replace(`/dashboard/agent?c=${d.conversation.id}`);
    reloadHistory();
    return d.conversation.id;
  }

  async function attach(list: FileList | null) {
    if (!list?.length) return;
    let cid: string;
    try {
      cid = await ensureConversation();
    } catch (e) {
      setNotice((e as Error).message);
      return;
    }
    for (const file of Array.from(list)) {
      const tempId = `tmp-${crypto.randomUUID()}`;
      const temp: AttachedFile = { id: tempId, name: file.name, mime_type: file.type, size_bytes: file.size, status: "uploading", status_detail: null, page_count: null };
      setFiles((f) => [...f, temp]);
      try {
        if (!/\.(pdf|docx|txt)$/i.test(file.name)) throw new Error("Only PDF, Word (.docx) and plain-text (.txt) files are supported.");
        if (file.size > 15 * 1024 * 1024) throw new Error("Files must be 15 MB or smaller.");
        const { path, token } = await getJson<{ path: string; token: string }>("/api/ai/files/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: cid, size: file.size, name: file.name }),
        });
        const contentType = /\.pdf$/i.test(file.name)
          ? "application/pdf"
          : /\.docx$/i.test(file.name)
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "text/plain";
        const { error } = await createClient().storage.from("ai-attachments").uploadToSignedUrl(path, token, file, { contentType });
        if (error) throw new Error("The upload didn't finish. Please try again.");
        setFiles((f) => f.map((x) => (x.id === tempId ? { ...x, status: "processing" } : x)));
        const { file: saved } = await getJson<{ file: AttachedFile }>("/api/ai/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: cid, path, name: file.name }),
        });
        setFiles((f) => f.map((x) => (x.id === tempId ? saved : x)));
        setPendingFileIds((ids) => [...ids, saved.id]);
      } catch (e) {
        setFiles((f) => f.map((x) => (x.id === tempId ? { ...x, status: "failed", status_detail: (e as Error).message } : x)));
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  async function removeFile(f: AttachedFile) {
    setPendingFileIds((ids) => ids.filter((i) => i !== f.id));
    setFiles((list) => list.filter((x) => x.id !== f.id));
    if (!f.id.startsWith("tmp-")) await fetch(`/api/ai/files/${f.id}`, { method: "DELETE" }).catch(() => {});
  }

  const patchMessage = useCallback((id: string, fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((ms) => ms.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim();
    if (!text || streaming || uploading) return;
    setInput("");
    setNotice(null);
    const attachmentIds = pendingFileIds;
    setPendingFileIds([]);

    const tempUser = `u-${crypto.randomUUID()}`;
    const tempAsst = `a-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    setMessages((ms) => [
      ...ms,
      { id: tempUser, role: "user", content: text, status: "complete", error: null, citations: [], events: [], attachment_ids: attachmentIds, created_at: now },
      { id: tempAsst, role: "assistant", content: "", status: "streaming", error: null, citations: [], events: [], attachment_ids: [], created_at: now, activity: "Thinking" },
    ]);
    setStreaming(true);
    const ac = new AbortController();
    abortRef.current = ac;
    let asstId = tempAsst;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, matterId, message: text, attachmentIds }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw Object.assign(new Error(d?.error ?? "The assistant couldn't respond."), { code: d?.code });
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "start") {
            if (!convId) {
              setConvId(ev.conversationId);
              router.replace(`/dashboard/agent?c=${ev.conversationId}`);
            }
            setConvTitle(ev.title);
            setMessages((ms) => ms.map((m) => (m.id === tempUser ? { ...m, id: ev.userMessageId } : m.id === tempAsst ? { ...m, id: ev.assistantMessageId } : m)));
            asstId = ev.assistantMessageId;
          } else if (ev.type === "text") {
            patchMessage(asstId, (m) => ({ ...m, content: m.content + ev.delta, activity: null }));
          } else if (ev.type === "final_text") {
            patchMessage(asstId, (m) => ({ ...m, content: ev.text }));
          } else if (ev.type === "tool") {
            patchMessage(asstId, (m) => ({ ...m, activity: ev.status === "running" ? TOOL_ACTIVITY[ev.name] ?? "Working" : null }));
          } else if (ev.type === "action" || ev.type === "memory_suggestion") {
            patchMessage(asstId, (m) => ({ ...m, events: [...m.events, ev as MessageEvent] }));
          } else if (ev.type === "citations") {
            patchMessage(asstId, (m) => ({ ...m, citations: ev.citations }));
          } else if (ev.type === "done") {
            patchMessage(asstId, (m) => ({
              ...m,
              status: ev.status,
              activity: null,
              error: ev.status === "interrupted" ? "Stopped." : ev.truncated ? "The answer hit the length limit and may be cut short." : null,
            }));
          } else if (ev.type === "error") {
            patchMessage(asstId, (m) => ({ ...m, status: "failed", activity: null, error: ev.message }));
          }
        }
      }
    } catch (e) {
      const aborted = (e as Error).name === "AbortError";
      patchMessage(asstId, (m) =>
        m.status === "streaming"
          ? { ...m, status: aborted ? "interrupted" : "failed", activity: null, error: aborted ? "Stopped." : (e as Error).message }
          : m
      );
      const code = (e as { code?: string }).code;
      if (code === "not_configured") setStatus((s) => (s ? { ...s, configured: false } : s));
    } finally {
      setStreaming(false);
      abortRef.current = null;
      reloadHistory();
      getJson<Status>("/api/ai/status").then(setStatus).catch(() => {});
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function runSuggestion(s: (typeof SUGGESTIONS)[number]) {
    if (s.needsMatter && !matterId) {
      setNotice("Choose a matter first; this works on a specific matter.");
      return;
    }
    if (s.text === "Review this document." && !pendingFileIds.length && !matterId) {
      setInput(s.text);
      fileInput.current?.click();
      return;
    }
    send(s.text);
  }

  async function openCitation(c: Citation) {
    if (c.kind === "document" && c.documentId) {
      window.open(`/dashboard/power-pdf/${c.documentId}?version=${c.versionId ?? ""}${c.page ? `&page=${c.page}` : ""}`, "_blank", "noopener");
      return;
    }
    if (c.fileId) {
      try {
        const { url } = await getJson<{ url: string }>(`/api/ai/files/${c.fileId}`);
        window.open(url + (c.page && /\.pdf$/i.test(c.name) ? `#page=${c.page}` : ""), "_blank", "noopener");
      } catch (e) {
        setNotice((e as Error).message);
      }
    }
  }

  function updateEvent(msgId: string, idx: number, next: MessageEvent) {
    patchMessage(msgId, (m) => ({ ...m, events: m.events.map((e, i) => (i === idx ? next : e)) }));
  }

  const configured = status?.configured ?? true;
  const empty = messages.length === 0 && !loadingConv;
  const composerDisabled = !configured || !!statusProblem;

  return (
    <div ref={rootRef} className="flex" style={{ height: height ?? "calc(100vh - 80px)" }}>
      {/* History */}
      {historyOpen && (
        <HistoryPanel
          conversations={conversations}
          activeId={convId}
          onOpen={openConversation}
          onClose={() => setHistoryOpen(false)}
          onRenamed={(id, title) => {
            setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, title } : c)));
            if (id === convId) setConvTitle(title);
          }}
          onDeleted={(id) => {
            setConversations((cs) => cs.filter((c) => c.id !== id));
            if (id === convId) newChat(null);
          }}
        />
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="px-5 sm:px-8 py-4 flex items-center gap-3 border-b border-line">
          <div className="flex items-center gap-2 text-[14px] font-medium text-muted min-w-0">
            <Sparkles size={15} strokeWidth={1.75} className="flex-shrink-0" />
            <span className="truncate">{convId ? convTitle : "AI Assistant"}</span>
          </div>
          {matter && (
            <span className="hidden sm:flex items-center gap-1.5 text-[12.5px] bg-card-alt rounded-full px-2.5 py-1 min-w-0">
              <Folder size={12} className="text-muted flex-shrink-0" />
              <span className="truncate max-w-[220px]">{matter.title}</span>
            </span>
          )}
          <div className="ml-auto flex items-center gap-1 text-muted">
            <IconBtn label="New chat" onClick={() => newChat()}>
              <SquarePen size={16} strokeWidth={1.75} />
            </IconBtn>
            <IconBtn label="History" active={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}>
              <History size={16} strokeWidth={1.75} />
            </IconBtn>
            <button
              onClick={() => setMemoryOpen(!memoryOpen)}
              className={`ml-1 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                memoryOpen ? "bg-dark text-white" : "bg-card-alt text-ink hover:bg-line/60"
              }`}
            >
              <Brain size={14} strokeWidth={1.75} /> Memory
            </button>
          </div>
        </div>

        {/* Setup / problems */}
        {(statusProblem || !configured) && (
          <div className="mx-5 sm:mx-8 mt-4 rounded-2xl border border-line bg-white px-5 py-4 flex gap-3">
            <KeyRound size={18} className="text-muted flex-shrink-0 mt-0.5" />
            <div className="text-[13.5px]">
              {statusProblem ? (
                <>
                  <div className="font-semibold mb-0.5">The AI Agent isn&apos;t ready</div>
                  <div className="text-muted">{statusProblem.message}</div>
                </>
              ) : (
                <>
                  <div className="font-semibold mb-0.5">Connect the AI provider</div>
                  <div className="text-muted">
                    Add <span className="mono text-ink">ANTHROPIC_API_KEY</span> to the server environment (Vercel → Settings → Environment Variables), then redeploy. Chat is off
                    until then. No placeholder answers are shown.
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Messages / empty state */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {loadingConv ? (
            <div className="flex items-center justify-center gap-2 h-full text-[14px] text-muted">
              <Loader2 size={15} className="animate-spin" /> Loading conversation…
            </div>
          ) : convError ? (
            <div className="max-w-[560px] mx-auto mt-16 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">{convError}</div>
          ) : empty ? (
            <div className="h-full flex flex-col items-center justify-center px-6">
              <h2 className="font-display text-[34px] sm:text-[36px] font-semibold mb-8 text-center">Your practice, in chat.</h2>
              <div className="w-full max-w-[600px]">
                <Composer
                  {...{ input, setInput, send, stop, streaming, uploading, textRef, fileInput, attach, files, removeFile, pendingFileIds, matter, matters, chooseMatter }}
                  disabled={composerDisabled}
                />
                <div className="flex flex-col items-start gap-2 mt-4 px-1">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.text}
                      onClick={() => runSuggestion(s)}
                      disabled={composerDisabled}
                      className="flex items-center gap-2 text-[13.5px] text-muted hover:text-ink disabled:opacity-50 disabled:hover:text-muted"
                    >
                      <CornerDownRight size={13} strokeWidth={1.75} />
                      {s.text}
                      {s.needsMatter && !matterId && <span className="text-[11.5px] text-muted/70">(choose a matter)</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-[780px] mx-auto px-5 sm:px-8 py-6 space-y-6">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%]">
                      {m.attachment_ids.length > 0 && (
                        <div className="flex flex-wrap justify-end gap-1.5 mb-1.5">
                          {m.attachment_ids.map((id) => {
                            const f = files.find((x) => x.id === id);
                            return (
                              <span key={id} className="flex items-center gap-1 text-[12px] bg-white border border-line rounded-lg px-2 py-0.5">
                                <FileText size={11} className="text-muted" /> {f?.name ?? "Attachment"}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <div className="bg-card-alt rounded-2xl rounded-br-md px-4 py-2.5 text-[14.5px] whitespace-pre-wrap break-words">{m.content}</div>
                    </div>
                  </div>
                ) : (
                  <AssistantMessage
                    key={m.id}
                    m={m}
                    convId={convId}
                    matterId={matterId}
                    onCite={openCitation}
                    onEvent={(idx, e) => {
                      updateEvent(m.id, idx, e);
                      if (e.type === "action" && e.action.status === "executed") refreshAll();
                      if (e.type === "memory_suggestion" && e.suggestion.saved) setMemoryRefresh((n) => n + 1);
                    }}
                    onRetry={() => {
                      const idx = messages.findIndex((x) => x.id === m.id);
                      const prev = [...messages.slice(0, idx)].reverse().find((x) => x.role === "user");
                      if (prev) send(prev.content);
                    }}
                  />
                )
              )}
            </div>
          )}
        </div>

        {/* Composer (in conversation) */}
        {!empty && !loadingConv && (
          <div className="px-5 sm:px-8 pb-4 pt-2">
            <div className="max-w-[780px] mx-auto">
              {notice && <div className="mb-2 text-[12.5px] text-muted">{notice}</div>}
              <Composer
                {...{ input, setInput, send, stop, streaming, uploading, textRef, fileInput, attach, files, removeFile, pendingFileIds, matter, matters, chooseMatter }}
                disabled={composerDisabled}
              />
              <Footnote status={status} />
            </div>
          </div>
        )}
        {empty && (
          <div className="px-6 pb-4">
            {notice && <div className="mb-2 text-center text-[12.5px] text-muted">{notice}</div>}
            <div className="max-w-[600px] mx-auto">
              <Footnote status={status} />
            </div>
          </div>
        )}
      </div>

      <MemoryPanel open={memoryOpen} onClose={() => setMemoryOpen(false)} matterId={matterId} matterTitle={matter?.title ?? null} refreshKey={memoryRefresh} />
    </div>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────

function IconBtn({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${active ? "bg-card-alt text-ink" : "hover:bg-card-alt hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function Footnote({ status }: { status: Status | null }) {
  return (
    <p className="text-[11.5px] text-muted text-center mt-2 leading-snug">
      Your messages, relevant document excerpts and the selected matter&apos;s details are sent to Anthropic&apos;s API to generate answers. AI can be wrong. Check
      important details, and treat drafts as drafts for attorney review.
      {status && status.usage.requestLimit > 0 && (
        <span className="block mt-0.5">
          {status.usage.requests} of {status.usage.requestLimit} messages used today
        </span>
      )}
    </p>
  );
}

type ComposerProps = {
  input: string;
  setInput: (v: string) => void;
  send: (t?: string) => void;
  stop: () => void;
  streaming: boolean;
  uploading: boolean;
  disabled: boolean;
  textRef: React.RefObject<HTMLTextAreaElement | null>;
  fileInput: React.RefObject<HTMLInputElement | null>;
  attach: (f: FileList | null) => void;
  files: AttachedFile[];
  removeFile: (f: AttachedFile) => void;
  pendingFileIds: string[];
  matter: { id: string; title: string } | null;
  matters: { id: string; title: string }[];
  chooseMatter: (id: string | null) => void;
};

function Composer({ textRef, fileInput, ...p }: ComposerProps) {
  const shown = p.files.filter((f) => p.pendingFileIds.includes(f.id) || f.status === "uploading" || f.status === "processing" || (f.status === "failed" && f.id.startsWith("tmp-")));
  return (
    <div className={`border border-line rounded-2xl px-4 pt-3 pb-3 bg-card-alt ${p.disabled ? "opacity-60" : ""}`}>
      {shown.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {shown.map((f) => (
            <span
              key={f.id}
              title={f.status_detail ?? undefined}
              className={`flex items-center gap-1.5 text-[12px] rounded-lg px-2 py-1 border max-w-full ${
                f.status === "failed" ? "bg-red-50 border-red-200 text-red-700" : f.status === "needs_ocr" ? "bg-[#F5E3B3]/60 border-[#E6CF8F]" : "bg-white border-line"
              }`}
            >
              {f.status === "uploading" || f.status === "processing" ? <Loader2 size={11} className="animate-spin" /> : f.status === "failed" || f.status === "needs_ocr" ? <AlertTriangle size={11} /> : <FileText size={11} className="text-muted" />}
              <span className="truncate max-w-[180px]">{f.name}</span>
              <span className="text-muted">
                {f.status === "uploading"
                  ? "Uploading…"
                  : f.status === "processing"
                    ? "Reading…"
                    : f.status === "needs_ocr"
                      ? "Scanned: needs OCR"
                      : f.status === "failed"
                        ? "Couldn't read"
                        : `${fileKind(f.name)}${f.page_count ? `, ${f.page_count} pp` : ""}`}
              </span>
              <button onClick={() => p.removeFile(f)} className="text-muted hover:text-ink" aria-label={`Remove ${f.name}`}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {shown.some((f) => (f.status === "failed" || f.status === "needs_ocr") && f.status_detail) && (
        <div className="text-[12px] text-muted mb-2">
          {shown.filter((f) => (f.status === "failed" || f.status === "needs_ocr") && f.status_detail).map((f) => (
            <div key={f.id}>
              <span className="font-medium text-ink">{f.name}:</span> {f.status_detail}
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={textRef}
        value={p.input}
        disabled={p.disabled}
        onChange={(e) => {
          p.setInput(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = `${Math.min(220, e.target.scrollHeight)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            p.send();
          }
        }}
        rows={1}
        placeholder={p.matter ? `Ask about ${p.matter.title}…` : "Ask anything"}
        className="w-full bg-transparent outline-none text-[15px] placeholder:text-muted resize-none mb-2.5 max-h-[220px]"
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <input ref={fileInput} type="file" multiple accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => p.attach(e.target.files)} />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={p.disabled}
            title="Attach PDF, Word or text files"
            aria-label="Attach files"
            className="w-7 h-7 rounded-full border border-line flex items-center justify-center text-muted hover:text-ink hover:border-muted flex-shrink-0"
          >
            <Plus size={14} strokeWidth={1.75} />
          </button>
          <MatterPicker matter={p.matter} matters={p.matters} onChoose={p.chooseMatter} disabled={p.disabled || p.streaming} />
        </div>
        {p.streaming ? (
          <button onClick={p.stop} title="Stop" aria-label="Stop generating" className="w-8 h-8 rounded-full bg-dark text-white flex items-center justify-center hover:bg-dark2 flex-shrink-0">
            <Square size={11} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={() => p.send()}
            disabled={p.disabled || !p.input.trim() || p.uploading}
            title={p.uploading ? "Waiting for files to finish" : "Send"}
            aria-label="Send"
            className="w-8 h-8 rounded-full bg-dark text-white flex items-center justify-center hover:bg-dark2 disabled:bg-card disabled:text-muted flex-shrink-0"
          >
            <ArrowUp size={15} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}

function MatterPicker({
  matter,
  matters,
  onChoose,
  disabled,
}: {
  matter: { id: string; title: string } | null;
  matters: { id: string; title: string }[];
  onChoose: (id: string | null) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = q.trim() ? matters.filter((m) => m.title.toLowerCase().includes(q.trim().toLowerCase())) : matters;
  const pick = (id: string | null) => {
    onChoose(id);
    setOpen(false);
    setQ("");
  };
  return (
    <div className="relative min-w-0">
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className={`flex items-center gap-1.5 text-[13px] border rounded-full px-3 py-1.5 min-w-0 transition-colors ${
          matter ? "border-ink/30 bg-white text-ink" : "border-line text-muted hover:text-ink"
        }`}
      >
        <Folder size={13} strokeWidth={1.75} className="flex-shrink-0" />
        <span className="truncate max-w-[160px] sm:max-w-[240px]">{matter?.title ?? "No matter"}</span>
        <ChevronDown size={12} strokeWidth={1.75} className="flex-shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 bottom-[calc(100%+6px)] z-50 w-[300px] bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5">
            {matters.length > 6 && (
              <div className="flex items-center gap-2 px-3 py-2 mb-1 border-b border-line">
                <Search size={13} className="text-muted" />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a matter" className="flex-1 bg-transparent outline-none text-[13.5px]" />
              </div>
            )}
            <div className="max-h-[280px] overflow-y-auto">
              {!q && (
                <button onClick={() => pick(null)} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13.5px] text-left ${!matter ? "bg-card-alt font-medium" : "hover:bg-card-alt/70"}`}>
                  <Layers size={14} className="text-muted" /> <span className="flex-1">No matter (general chat)</span>
                  {!matter && <Check size={14} />}
                </button>
              )}
              {list.map((m) => (
                <button key={m.id} onClick={() => pick(m.id)} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13.5px] text-left ${matter?.id === m.id ? "bg-card-alt font-medium" : "hover:bg-card-alt/70"}`}>
                  <Folder size={14} className="text-muted flex-shrink-0" /> <span className="flex-1 truncate">{m.title}</span>
                  {matter?.id === m.id && <Check size={14} />}
                </button>
              ))}
              {list.length === 0 && <div className="px-3 py-3 text-[13px] text-muted">{matters.length ? "No matching matters" : "No matters yet"}</div>}
            </div>
            <div className="px-3 pt-2 pb-1 text-[11.5px] text-muted border-t border-line mt-1">Switching matter starts a separate conversation.</div>
          </div>
        </>
      )}
    </div>
  );
}

function AssistantMessage({
  m,
  convId,
  matterId,
  onCite,
  onEvent,
  onRetry,
}: {
  m: ChatMessage;
  convId: string | null;
  matterId: string | null;
  onCite: (c: Citation) => void;
  onEvent: (idx: number, e: MessageEvent) => void;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const citations = useMemo(() => m.citations ?? [], [m.citations]);
  return (
    <div className="group">
      {m.content ? (
        <Markdown text={m.content} citations={citations} onCite={onCite} />
      ) : m.status === "streaming" ? null : m.status === "failed" ? null : (
        <div className="text-[14px] text-muted italic">No answer was generated.</div>
      )}

      {m.status === "streaming" && (
        <div className="flex items-center gap-2 text-[13px] text-muted mt-1">
          <Loader2 size={13} className="animate-spin" /> {m.activity ?? (m.content ? "" : "Thinking")}
          {m.activity && "…"}
        </div>
      )}

      {m.events.map((e, i) =>
        e.type === "action" ? (
          <ActionCard key={e.action.id} action={e.action} onChange={(a) => onEvent(i, { type: "action", action: a })} />
        ) : (
          <MemorySuggestionCard
            key={e.suggestion.id}
            suggestion={e.suggestion}
            conversationId={convId}
            matterId={matterId}
            onChange={(s: MemorySuggestion) => onEvent(i, { type: "memory_suggestion", suggestion: s })}
          />
        )
      )}

      {citations.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {citations.map((c) => (
            <button
              key={c.id}
              onClick={() => onCite(c)}
              className="flex items-center gap-1.5 text-[12px] bg-white border border-line rounded-lg px-2 py-1 hover:border-muted max-w-full"
              title="Open source"
            >
              <span className="font-semibold">{c.id.replace("S", "")}</span>
              <Paperclip size={11} className="text-muted flex-shrink-0" />
              <span className="truncate max-w-[280px]">{citationLabel(c)}</span>
            </button>
          ))}
        </div>
      )}

      {(m.status === "interrupted" || m.status === "failed" || m.error) && m.status !== "streaming" && (
        <div
          className={`mt-2 flex items-center gap-2 text-[12.5px] ${m.status === "failed" ? "text-red-700" : "text-muted"}`}
        >
          <AlertTriangle size={13} />
          {m.status === "interrupted" ? (m.error && m.error !== "Stopped." ? m.error : "Stopped before finishing.") : m.error}
          {(m.status === "failed" || m.status === "interrupted") && (
            <button onClick={onRetry} className="underline underline-offset-2 hover:text-ink">
              Try again
            </button>
          )}
        </div>
      )}

      {m.status !== "streaming" && m.content && (
        <div className="mt-1.5 flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => {
              navigator.clipboard.writeText(m.content).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="flex items-center gap-1 text-[12px] text-muted hover:text-ink px-1.5 py-1 rounded-md hover:bg-card-alt"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}

function HistoryPanel({
  conversations,
  activeId,
  onOpen,
  onClose,
  onRenamed,
  onDeleted,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
  onRenamed: (id: string, title: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function rename(id: string) {
    try {
      const d = await getJson<{ title: string }>(`/api/ai/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      onRenamed(id, d.title);
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this conversation? Its messages and attached files are removed permanently.")) return;
    try {
      await getJson(`/api/ai/conversations/${id}`, { method: "DELETE" });
      onDeleted(id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40 lg:hidden" onClick={onClose} />
      <aside className="fixed lg:static left-0 top-0 bottom-0 z-50 w-[300px] flex-shrink-0 bg-cream border-r border-line flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-4 border-b border-line">
          <span className="font-display text-[16px] font-semibold">Conversations</span>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close history">
            <X size={17} strokeWidth={1.75} />
          </button>
        </div>
        {error && <div className="m-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{error}</div>}
        <div className="flex-1 overflow-y-auto p-2">
          {conversations.length === 0 ? (
            <div className="text-[13px] text-muted text-center py-8">No conversations yet.</div>
          ) : (
            conversations.map((c) => (
              <div key={c.id} className={`group rounded-xl px-3 py-2 mb-0.5 ${c.id === activeId ? "bg-card-alt" : "hover:bg-card-alt/60"}`}>
                {editing === c.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") rename(c.id);
                        if (e.key === "Escape") setEditing(null);
                      }}
                      className="flex-1 bg-white border border-line rounded-md px-2 py-1 text-[13px] outline-none focus:border-ink"
                    />
                    <button onClick={() => rename(c.id)} className="p-1 text-muted hover:text-ink" aria-label="Save name">
                      <Check size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <button onClick={() => onOpen(c.id)} className="flex-1 min-w-0 text-left">
                      <div className="text-[13.5px] truncate">{c.title}</div>
                      <div className="text-[11.5px] text-muted truncate flex items-center gap-1">
                        {c.matterTitle ? (
                          <>
                            <Folder size={10} /> {c.matterTitle}
                          </>
                        ) : (
                          "General"
                        )}
                        <span>· {new Date(c.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      </div>
                    </button>
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => (setEditing(c.id), setTitle(c.title))} className="p-1 text-muted hover:text-ink" aria-label="Rename">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => remove(c.id)} className="p-1 text-muted hover:text-red-600" aria-label="Delete">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
