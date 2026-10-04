"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, Trash2, Paperclip, Sparkles, FileText } from "lucide-react";
import SelectBox from "@/components/SelectBox";
import { createClient } from "@/lib/supabase/client";
import { ACCOUNT_LABEL, categoriesFor, CAT, type Account, type Kind, type Txn } from "@/lib/accounting/core";

const field = "w-full border border-line rounded-xl px-3.5 py-2.5 text-[14px] bg-white outline-none focus:border-ink placeholder:text-muted";
const Label = ({ children }: { children: React.ReactNode }) => <div className="text-[13px] font-medium mb-1.5">{children}</div>;

async function readJson(res: Response) {
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d?.error ?? `Request failed (${res.status})`);
  return d;
}

export async function uploadReceipt(file: File): Promise<{ path: string; name: string }> {
  const { path, token } = await fetch("/api/accounting/receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, size: file.size }),
  }).then(readJson);
  const { error } = await createClient().storage.from("accounting-receipts").uploadToSignedUrl(path, token, file, { contentType: file.type || undefined });
  if (error) throw new Error("The receipt couldn't be uploaded. Please try again.");
  return { path, name: file.name.slice(0, 200) };
}

export default function TxnModal({
  txn,
  initialFile,
  clients,
  matters,
  onClose,
  onSaved,
  onDeleted,
}: {
  txn?: Txn;
  initialFile?: File | null;
  clients: { id: string; name: string }[];
  matters: { id: string; title: string; clientId?: string | null }[];
  onClose: () => void;
  onSaved: (t: Txn) => void;
  onDeleted?: (id: string) => void;
}) {
  const [kind, setKind] = useState<Kind>(txn?.kind ?? "expense");
  const [date, setDate] = useState(txn?.date ?? new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(txn ? String(txn.amount) : "");
  const [counterparty, setCounterparty] = useState(txn?.counterparty ?? "");
  const [description, setDescription] = useState(txn?.description ?? "");
  const [category, setCategory] = useState(txn?.category ?? "uncategorized");
  const [account, setAccount] = useState<Account>(txn?.account ?? "operating");
  const [clientId, setClientId] = useState(txn?.clientId ?? "");
  const [matterId, setMatterId] = useState(txn?.matterId ?? "");
  const [reimbursable, setReimbursable] = useState(txn?.reimbursable ?? false);
  const [notes, setNotes] = useState(txn?.notes ?? "");
  const [receipt, setReceipt] = useState<{ path: string; name: string } | null>(txn?.receiptPath ? { path: txn.receiptPath, name: txn.receiptName ?? "Receipt" } : null);
  const [busy, setBusy] = useState<null | "save" | "delete" | "upload" | "scan">(null);
  const [error, setError] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function attach(file: File) {
    setError(null);
    setAiNote(null);
    setBusy("upload");
    try {
      const r = await uploadReceipt(file);
      setReceipt(r);
      if (!r.path.endsWith(".pdf")) {
        setAiNote("Photo receipts are stored as-is. Please type the vendor, date and amount.");
        return;
      }
      setBusy("scan");
      const { guess, reason } = await fetch("/api/accounting/receipt/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: r.path }),
      }).then(readJson);
      if (!guess) {
        setAiNote(reason === "no_text" ? "This PDF is a scan with no readable text. Please fill in the details." : "The AI couldn't read this receipt. Please fill in the details.");
        return;
      }
      if (guess.date) setDate(guess.date);
      if (guess.amount) setAmount(String(guess.amount));
      if (guess.counterparty) setCounterparty(guess.counterparty);
      if (guess.description) setDescription(guess.description);
      if (guess.category && CAT[guess.category]) {
        setCategory(guess.category);
        setKind(CAT[guess.category].kind);
        if (guess.category === "client_costs") setReimbursable(true);
      }
      setAiNote(`Filled in by AI${guess.reason ? `: ${guess.reason}` : ""}. Please check before saving.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // A receipt dropped on the page opens this window and is read right away.
  useEffect(() => {
    if (initialFile && !started.current) {
      started.current = true;
      void attach(initialFile);
    }
  }, [initialFile]);

  async function save() {
    const n = Number(amount.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n <= 0) return setError("Enter the amount.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Enter the date.");
    setBusy("save");
    setError(null);
    try {
      const body = {
        kind: CAT[category]?.kind === "transfer" ? "transfer" : kind,
        date,
        amount: Math.round(n * 100) / 100,
        counterparty: counterparty.trim(),
        description: description.trim(),
        category,
        account,
        clientId: clientId || null,
        matterId: matterId || null,
        reimbursable,
        notes,
        receiptPath: receipt?.path ?? null,
        receiptName: receipt?.name ?? null,
        status: category === "uncategorized" ? "needs_review" : "ready",
        ...(txn ? {} : { source: receipt ? "receipt" : "manual" }),
      };
      const d = await fetch(txn ? `/api/accounting/${txn.id}` : "/api/accounting", {
        method: txn ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(readJson);
      onSaved(d.txn);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function remove() {
    if (!txn || !confirm("Delete this transaction? Its receipt is deleted too.")) return;
    setBusy("delete");
    try {
      await fetch(`/api/accounting/${txn.id}`, { method: "DELETE" }).then(readJson);
      onDeleted?.(txn.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function viewReceipt() {
    if (!receipt) return;
    const { urls } = await fetch("/api/accounting/receipt/urls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: [receipt.path] }),
    }).then(readJson);
    if (urls[receipt.path]) window.open(urls[receipt.path], "_blank", "noopener");
  }

  const cats = categoriesFor(kind);
  const visibleMatters = clientId ? matters.filter((m) => m.clientId === clientId) : matters;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6" onClick={() => !busy && onClose()}>
      <div className="bg-cream rounded-2xl w-full max-w-[620px] max-h-full overflow-y-auto p-7 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <h2 className="text-[20px] font-semibold">{txn ? "Edit transaction" : "Add transaction"}</h2>
          <button onClick={onClose} disabled={!!busy} className="text-muted hover:text-ink" aria-label="Close">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])} />
        <div className="mb-5 flex items-center gap-3 flex-wrap rounded-xl border border-dashed border-line bg-white/70 px-4 py-3">
          {receipt ? (
            <>
              <FileText size={16} strokeWidth={1.75} className="text-muted" />
              <button onClick={viewReceipt} className="text-[13.5px] font-medium underline underline-offset-2 truncate max-w-[260px]">
                {receipt.name}
              </button>
              <button onClick={() => fileRef.current?.click()} className="text-[12.5px] text-muted hover:text-ink">
                Replace
              </button>
              <button onClick={() => setReceipt(null)} className="text-[12.5px] text-muted hover:text-red-700">
                Remove
              </button>
            </>
          ) : (
            <button onClick={() => fileRef.current?.click()} disabled={!!busy} className="flex items-center gap-2 text-[13.5px] font-medium">
              <Paperclip size={15} strokeWidth={1.75} /> Attach receipt or invoice
              <span className="text-[12.5px] text-muted font-normal">PDFs are read by AI</span>
            </button>
          )}
          {(busy === "upload" || busy === "scan") && (
            <span className="flex items-center gap-1.5 text-[12.5px] text-muted ml-auto">
              <Loader2 size={13} className="animate-spin" /> {busy === "scan" ? "Reading receipt…" : "Uploading…"}
            </span>
          )}
        </div>
        {aiNote && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-card-alt px-3.5 py-2.5 text-[13px]">
            <Sparkles size={14} strokeWidth={1.75} className="mt-0.5 flex-shrink-0" /> {aiNote}
          </div>
        )}

        <div className="flex gap-2 mb-4">
          {(["expense", "income", "transfer"] as Kind[]).map((k) => (
            <button
              key={k}
              onClick={() => {
                setKind(k);
                if (CAT[category]?.kind !== k) setCategory("uncategorized");
              }}
              className={`px-3.5 py-1.5 rounded-full text-[13.5px] font-medium transition-colors ${
                kind === k ? "bg-btn text-ink ring-1 ring-inset ring-btn-ring" : "bg-card-alt hover:bg-line/70"
              }`}
            >
              {k === "expense" ? "Money out" : k === "income" ? "Money in" : "Transfer / owner"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Date</Label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </div>
          <div>
            <Label>Amount</Label>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={field} />
          </div>
          <div>
            <Label>{kind === "income" ? "Received from" : "Paid to"}</Label>
            <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder={kind === "income" ? "Client or payer" : "Vendor"} className={field} />
          </div>
          <div>
            <Label>Category</Label>
            <SelectBox label="Category" value={category} onChange={(v) => { setCategory(v); if (v === "client_costs") setReimbursable(true); }}>
              {cats.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </SelectBox>
          </div>
          <div className="sm:col-span-2">
            <Label>Description</Label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it was for" className={field} />
            {CAT[category]?.hint && <div className="text-[12px] text-muted mt-1">{CAT[category].hint}</div>}
          </div>
          <div>
            <Label>Account</Label>
            <SelectBox label="Account" value={account} onChange={(v) => setAccount(v as Account)}>
              {(Object.keys(ACCOUNT_LABEL) as Account[]).map((a) => (
                <option key={a} value={a}>
                  {ACCOUNT_LABEL[a]}
                </option>
              ))}
            </SelectBox>
          </div>
          <div>
            <Label>Client</Label>
            <SelectBox label="Client" value={clientId} onChange={(v) => { setClientId(v); setMatterId(""); }}>
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectBox>
          </div>
          <div>
            <Label>Matter</Label>
            <SelectBox label="Matter" value={matterId} onChange={(v) => { setMatterId(v); const m = matters.find((x) => x.id === v); if (m?.clientId) setClientId(m.clientId); }}>
              <option value="">No matter</option>
              {visibleMatters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </SelectBox>
          </div>
          <label className="flex items-center gap-2.5 text-[13.5px] mt-7">
            <input type="checkbox" checked={reimbursable} onChange={(e) => setReimbursable(e.target.checked)} className="w-4 h-4 accent-black" />
            Client will reimburse this cost
          </label>
          <div className="sm:col-span-2">
            <Label>Notes for your accountant</Label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${field} resize-y`} placeholder="Business purpose, who attended, anything unusual" />
          </div>
        </div>

        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">{error}</div>}

        <div className="flex items-center gap-2 mt-6">
          {txn && onDeleted && (
            <button onClick={remove} disabled={!!busy} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13.5px] font-medium text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50">
              <Trash2 size={14} strokeWidth={1.75} /> Delete
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} disabled={!!busy} className="bg-card-alt hover:bg-line/70 px-4 py-2 rounded-full text-[13.5px] font-medium disabled:opacity-50">
            Cancel
          </button>
          <button onClick={save} disabled={!!busy} className="bg-btn text-ink px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-btn-hover flex items-center gap-1.5 disabled:opacity-60">
            {busy === "save" && <Loader2 size={14} className="animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
