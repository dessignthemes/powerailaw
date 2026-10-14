"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X, ExternalLink } from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";
import { todayYmd, type TaskPriority } from "@/components/NewTaskModal";
import { displayName } from "@/lib/initials";
import SelectBox from "@/components/SelectBox";
import type { MailMessage, MailProvider, MailSummary } from "@/lib/mail/types";

const LAST_BOARD_KEY = "lawpower.triage.lastBoard";
const MAX_BODY = 20000; // characters of email text copied into the task

// Readable plain text from an email's HTML (runs in the browser only).
export function htmlToText(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, head").forEach((n) => n.remove());
  doc.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
  doc.querySelectorAll("p, div, tr, li, h1, h2, h3, h4, blockquote").forEach((n) => n.append("\n"));
  return (doc.body.textContent ?? "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function emailHeader(email: MailSummary) {
  return `From: ${email.from}${email.fromEmail && email.fromEmail !== email.from ? ` <${email.fromEmail}>` : ""}\nReceived: ${new Date(email.date).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  })}\nSubject: ${email.subject || "(no subject)"}`;
}

// "Turn into task": a task made from an email (title, assignee, board, priority,
// due date, the email's text), used by the Task Folder and the Inbox.
export default function CreateTaskFromEmail({
  email,
  provider,
  members,
  boards,
  onClose,
  onCreate,
}: {
  email: MailSummary;
  provider: MailProvider;
  members: { id: string; email: string; fullName?: string | null }[];
  boards: { id: string; name: string }[];
  onClose: () => void;
  onCreate: (task: Parameters<ReturnType<typeof useWorkspaceData>["addTask"]>[0], boardId: string | null) => void;
}) {
  const { generalName } = useWorkspaceData();
  const [title, setTitle] = useState(email.subject?.trim() || `Email from ${email.from || email.fromEmail}`);
  const [assignee, setAssignee] = useState<string>("");
  const [board, setBoard] = useState<string>(() => {
    try {
      const b = window.localStorage.getItem(LAST_BOARD_KEY);
      return b && (b === "general" || boards.some((x) => x.id === b)) ? b : "general";
    } catch {
      return "general";
    }
  });
  const [due, setDue] = useState(todayYmd());
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [link, setLink] = useState<string | null>(null);
  const [notes, setNotes] = useState(`${emailHeader(email)}\n\n${email.snippet}`);
  const notesEdited = useRef(false); // has the person typed in the notes yet?
  const [bodyState, setBodyState] = useState<"loading" | "full" | "preview">("loading");

  // The full email (text + a link back to it in Outlook / Gmail) for the task notes.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/mail/messages/${encodeURIComponent(email.id)}?provider=${provider}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { message?: MailMessage } | null) => {
        if (cancelled) return;
        const msg = d?.message;
        if (msg?.webLink) setLink(msg.webLink);
        const body = (msg?.text?.trim() || (msg?.html ? htmlToText(msg.html) : "")).slice(0, MAX_BODY);
        if (!body) return setBodyState("preview");
        setBodyState("full");
        // Don't overwrite anything the person has already typed.
        if (!notesEdited.current) setNotes(`${emailHeader(email)}\n\n${body}`);
      })
      .catch(() => !cancelled && setBodyState("preview"));
    return () => {
      cancelled = true;
    };
  }, [email, provider]);

  function create() {
    if (!title.trim()) return;
    const boardId = board === "general" ? null : board;
    try {
      window.localStorage.setItem(LAST_BOARD_KEY, board);
    } catch {
      // not remembered
    }
    onCreate(
      {
        id: crypto.randomUUID(),
        title: title.trim().slice(0, 200),
        description: `${notes.trim()}${link ? `\n\nOpen email: ${link}` : ""}`,
        status: "todo",
        priority,
        assignee: assignee || null,
        dueDate: due || null,
        comments: [],
        boardId,
      },
      boardId
    );
  }

  const field = "w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none focus:border-ink";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-cream rounded-3xl w-full max-w-[720px] max-h-[92vh] overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-[19px] font-semibold">Create task from email</h2>
            <p className="text-[13px] text-muted">The email stays in your mailbox; the task goes to your team&apos;s board.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <label className="block text-[12.5px] font-medium text-muted mb-1">Task</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={`${field} mb-3`} autoFocus />

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1">Assign to</label>
            <SelectBox label="Assign to" value={assignee} onChange={(v) => setAssignee(v)}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.email}>
                  {displayName(m.fullName, m.email)}
                </option>
              ))}
            </SelectBox>
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1">Board</label>
            <SelectBox label="Board" value={board} onChange={(v) => setBoard(v)}>
              <option value="general">{generalName}</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </SelectBox>
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1">Due date</label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={field} />
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1">Priority</label>
            <SelectBox label="Priority" value={priority} onChange={(v) => setPriority(v as TaskPriority)}>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </SelectBox>
          </div>
        </div>

        <label className="block text-[12.5px] font-medium text-muted mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            notesEdited.current = true;
          }}
          rows={12}
          className={`${field} resize-y mb-1 leading-relaxed`}
        />
        <div className="text-[12px] text-muted mb-5 flex items-center gap-1.5">
          {bodyState === "loading" ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Loading the full email…
            </>
          ) : (
            <>
              <ExternalLink size={12} />
              {bodyState === "full" ? "The full email is in the notes" : "Only the email preview could be loaded"}
              {link ? ", with a link to open it." : "."}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-full text-[13.5px] font-medium text-muted hover:text-ink">
            Cancel
          </button>
          <button onClick={create} disabled={!title.trim()} className="bg-btn text-ink px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-btn-hover disabled:opacity-40">
            Create task
          </button>
        </div>
      </div>
    </div>
  );
}
