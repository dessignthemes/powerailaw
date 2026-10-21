"use client";

import { useRef, useState } from "react";
import { Upload, X, CheckCircle2, Loader2, ShieldCheck, FileText } from "lucide-react";

const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg";
const MAX_BYTES = 100 * 1024 * 1024;
const MAX_FILES = 20;
const OK_EXT = /\.(pdf|docx?|xlsx?|csv|txt|png|jpe?g)$/i;

type Item = { file: File; progress: number; state: "waiting" | "uploading" | "done" | "error"; error?: string };
const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

// Uploads one file straight to private storage through a one-time signed slot,
// reporting progress (large files go directly from the browser, not through LawPower).
function putToSlot(slot: { path: string; token: string }, file: File, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    const url = `${base}/storage/v1/object/upload/sign/matter-documents/${slot.path.split("/").map(encodeURIComponent).join("/")}?token=${encodeURIComponent(slot.token)}`;
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("apikey", key);
    xhr.setRequestHeader("Authorization", `Bearer ${key}`);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.status === 413 ? "The file is too large." : "The upload didn't finish. Please try again.")));
    xhr.onerror = () => reject(new Error("The connection dropped. Please try again."));
    xhr.send(body);
  });
}

async function json(res: Response) {
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d?.error ?? "Something went wrong. Please try again.");
  return d;
}

// "Send documents" on the client portal: drop files, pick the matter, send.
// Files go to the matter's Documents at the firm (marked as from the client) and
// show in the client's own document list; the firm is alerted.
export default function PortalUploads({
  firm,
  matters,
  fixedMatterId,
  onSent,
}: {
  firm: string;
  matters: { id: string; title: string }[];
  fixedMatterId?: string;
  onSent?: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [matterId, setMatterId] = useState(fixedMatterId ?? (matters.length === 1 ? matters[0].id : ""));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function add(list: FileList | null) {
    if (!list) return;
    setError(null);
    setDone(null);
    const bad: string[] = [];
    const next = [...items];
    for (const f of Array.from(list)) {
      if (!OK_EXT.test(f.name)) bad.push(`"${f.name}" isn't a PDF, Word, Excel, text, JPG or PNG file.`);
      else if (f.size > MAX_BYTES) bad.push(`"${f.name}" is larger than 100 MB.`);
      else if (!f.size) bad.push(`"${f.name}" is empty.`);
      else if (next.length >= MAX_FILES) bad.push(`Up to ${MAX_FILES} files at a time.`);
      else if (!next.some((x) => x.file.name === f.name && x.file.size === f.size)) next.push({ file: f, progress: 0, state: "waiting" });
    }
    setItems(next);
    if (bad.length) setError([...new Set(bad)].join(" "));
  }

  async function send() {
    if (!matterId || !items.length) return;
    setBusy(true);
    setError(null);
    const set = (i: number, patch: Partial<Item>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    const uploaded: { path: string; name: string; ticket: string }[] = [];
    // One at a time, so a slow connection still shows steady progress.
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.state === "done") continue;
      try {
        set(i, { state: "uploading", progress: 0, error: undefined });
        const slot = await fetch("/api/portal/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matterId, name: it.file.name, size: it.file.size }) }).then(json);
        await putToSlot(slot, it.file, (p) => set(i, { progress: p }));
        uploaded.push({ path: slot.path, name: it.file.name, ticket: slot.ticket });
        set(i, { progress: 100 });
      } catch (e) {
        set(i, { state: "error", error: (e as Error).message });
      }
    }
    // Hand the uploaded files over (10 per message); each is checked and saved.
    let saved = 0;
    try {
      for (let k = 0; k < uploaded.length; k += 10) {
        const batch = uploaded.slice(k, k + 10);
        const text = note.trim() || `Sent ${uploaded.length === 1 ? "a document" : `${uploaded.length} documents`} through the portal.`;
        await fetch("/api/portal/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matterId, body: k === 0 ? text : "", uploads: batch }),
        }).then(json);
        saved += batch.length;
        setItems((xs) => xs.map((x) => (batch.some((b) => b.name === x.file.name) ? { ...x, state: "done" } : x)));
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
    if (saved) {
      setDone(`${saved === 1 ? "1 document" : `${saved} documents`} sent securely to ${firm}.`);
      setNote("");
      setItems((xs) => xs.filter((x) => x.state !== "done"));
      onSent?.();
    }
  }

  const pending = items.filter((x) => x.state !== "done").length;
  return (
    <section className="bg-card-alt rounded-2xl p-5 mb-8">
      <div className="flex items-center gap-2 mb-1">
        <Upload size={16} className="text-muted" />
        <h2 className="text-[15px] font-semibold" style={{ letterSpacing: 0 }}>
          Send documents to {firm}
        </h2>
      </div>
      <p className="text-[13px] text-muted mb-4">PDF, Word, Excel, text, JPG or PNG, up to 100 MB each and {MAX_FILES} at a time.</p>

      {!fixedMatterId && matters.length > 1 && (
        <label className="flex flex-col gap-1 mb-3 text-[13px]">
          <span className="font-medium">Which matter are these for?</span>
          <select value={matterId} onChange={(e) => setMatterId(e.target.value)} className="bg-white border border-line rounded-lg px-3 py-2 text-[13.5px] outline-none max-w-[480px]">
            <option value="">Choose…</option>
            {matters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        disabled={busy}
        className={`w-full border-2 border-dashed rounded-2xl py-7 flex flex-col items-center gap-1.5 transition-colors ${over ? "border-ink bg-white" : "border-btn hover:bg-white"}`}
      >
        <Upload size={18} className="text-muted" />
        <span className="text-[14px] font-medium">Choose files or drop them here</span>
        <span className="text-[12.5px] text-muted">They go straight to secure storage; only you and {firm} can see them.</span>
      </button>
      <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => (add(e.target.files), (e.target.value = ""))} />

      {items.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {items.map((it, i) => (
            <div key={`${it.file.name}-${i}`} className="bg-white border border-line rounded-xl px-3 py-2">
              <div className="flex items-center gap-2 text-[13px]">
                <FileText size={14} className="text-muted flex-shrink-0" />
                <span className="truncate flex-1">{it.file.name}</span>
                <span className="text-muted flex-shrink-0">{size(it.file.size)}</span>
                {it.state === "done" ? (
                  <CheckCircle2 size={14} className="text-[#1F7A4D]" />
                ) : !busy ? (
                  <button onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} aria-label={`Remove ${it.file.name}`} className="w-6 h-6 rounded-full hover:bg-chip flex items-center justify-center text-muted">
                    <X size={12} />
                  </button>
                ) : null}
              </div>
              {(it.state === "uploading" || (busy && it.progress > 0)) && (
                <div className="mt-1.5 h-1.5 rounded-full bg-[#E1E5EC] overflow-hidden">
                  <div className="h-full bg-[#5E6E8C] transition-[width]" style={{ width: `${it.progress}%` }} />
                </div>
              )}
              {it.error && <div className="text-[12px] text-[#B42318] mt-1">{it.error}</div>}
            </div>
          ))}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a note (optional), e.g. what these documents are" className="mt-1 bg-white border border-line rounded-xl px-3 py-2 text-[13.5px] outline-none resize-y" />
        </div>
      )}

      {error && <div className="mt-3 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-2.5 text-[13px]">{error}</div>}
      {done && (
        <div className="mt-3 rounded-xl bg-[#E7F6EE] text-[#155C3A] px-4 py-2.5 text-[13px] flex gap-2 items-center">
          <CheckCircle2 size={15} /> {done}
        </div>
      )}

      <div className="flex items-center gap-3 mt-3">
        <span className="text-[12px] text-muted flex items-center gap-1.5">
          <ShieldCheck size={12} /> Encrypted in transit and stored privately.
        </span>
        <button
          onClick={() => void send()}
          disabled={busy || !pending || !matterId}
          className="ml-auto bg-btn hover:bg-btn-hover disabled:opacity-50 px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-2"
        >
          {busy && <Loader2 size={14} className="animate-spin" />} {busy ? "Sending…" : `Send ${pending === 1 ? "1 file" : `${pending} files`}`}
        </button>
      </div>
    </section>
  );
}
