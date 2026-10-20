"use client";

import { useEffect, useRef, useState } from "react";
import { X, Upload, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { parseContactsFile, type ImportedContact } from "@/lib/contacts/importParse";

export type ImportSource = "outlook" | "iphone" | "ringcentral" | "csv";

const TITLE: Record<ImportSource, string> = {
  outlook: "Import from Microsoft Outlook",
  iphone: "Import from iPhone / iCloud",
  ringcentral: "Import from RingCentral",
  csv: "Import from a CSV file",
};

type OutlookStatus = { connected: boolean; email: string | null; permission: boolean; syncing: boolean; lastSyncedAt: string | null; setupRequired: boolean };

async function readJson(res: Response) {
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(d?.error ?? "Something went wrong. Please try again."), { code: d?.code });
  return d;
}

const connectOutlook = "/connect?provider=microsoft&next=/dashboard/records";

export default function ImportContactsModal({ source, onClose, onImported }: { source: ImportSource; onClose: () => void; onImported: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center px-4" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-[620px] shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={TITLE[source]}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-[17px] font-semibold">{TITLE[source]}</h2>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-chip flex items-center justify-center">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 pb-6">
          {source === "outlook" ? (
            <OutlookImport busy={busy} setBusy={setBusy} setError={setError} done={done} setDone={setDone} onImported={onImported} />
          ) : (
            <FileImport source={source} busy={busy} setBusy={setBusy} setError={setError} done={done} setDone={setDone} onImported={onImported} />
          )}
          {error && <div className="mt-4 rounded-xl bg-[#FDECEC] text-[#9F1D1D] px-4 py-3 text-[13.5px]">{error}</div>}
        </div>
      </div>
    </div>
  );
}

type Shared = {
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string | null) => void;
  done: string | null;
  setDone: (d: string | null) => void;
  onImported: () => void;
};

function Done({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-xl bg-[#E7F6EE] text-[#155C3A] px-4 py-3 text-[13.5px] flex gap-2 items-start">
      <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" /> <span>{text}</span>
    </div>
  );
}

function OutlookImport({ busy, setBusy, setError, done, setDone, onImported }: Shared) {
  const [st, setSt] = useState<OutlookStatus | null>(null);
  const [keep, setKeep] = useState(true);

  const load = () =>
    fetch("/api/contacts/outlook")
      .then(readJson)
      .then((d: OutlookStatus) => {
        setSt(d);
        if (d.syncing) setKeep(true);
      })
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const d = await fetch("/api/contacts/outlook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keepSyncing: keep }) }).then(readJson);
      setDone(
        `${d.added === 1 ? "1 new contact" : `${d.added} new contacts`} added${d.updated ? `, ${d.updated} updated` : ""}.` +
          (keep ? " New contacts you add in Outlook will appear in LawPower too." : "")
      );
      onImported();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/contacts/outlook", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: false }) }).then(readJson);
      setKeep(false);
      setDone("Stopped. Contacts already brought in stay in LawPower; new Outlook contacts won't be added.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!st) return <div className="text-[13.5px] text-muted flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Checking your Outlook connection…</div>;
  if (st.setupRequired)
    return <p className="text-[13.5px] text-muted">Importing contacts needs a database update first (migration 0045). Ask your administrator, then try again.</p>;
  if (!st.connected || !st.permission)
    return (
      <div className="text-[13.5px]">
        <p className="text-muted mb-4">
          {st.connected
            ? "LawPower needs permission to read your Outlook contacts. Reconnect Outlook once and keep Outlook Contacts ticked. LawPower only reads contacts; it never changes or deletes them in Outlook."
            : "Connect Outlook first. LawPower only reads your contacts; it never changes or deletes them in Outlook."}
        </p>
        <a href={connectOutlook} className="inline-flex bg-btn hover:bg-btn-hover px-4 py-2 rounded-full font-medium">
          {st.connected ? "Reconnect Outlook" : "Connect Outlook"}
        </a>
      </div>
    );

  return (
    <div className="text-[13.5px]">
      <p className="text-muted mb-4">
        Brings the contacts from your Outlook ({st.email}) into LawPower Contacts, where everyone in the firm can see them. Contacts the firm already has (same email) aren&apos;t added twice. LawPower never changes or deletes anything in Outlook.
      </p>
      <label className="flex items-start gap-2.5 mb-5 cursor-pointer">
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#5E6E8C]" />
        <span>
          <span className="font-medium">Keep in step with Outlook</span>
          <span className="block text-muted">New contacts you add in Outlook appear here: whenever Contacts is opened, and once a day.</span>
        </span>
      </label>
      {st.syncing && (
        <div className="mb-4 flex items-center gap-2 text-muted">
          <RefreshCw size={13} /> Kept in step{st.lastSyncedAt ? ` · last checked ${new Date(st.lastSyncedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}
          <button onClick={() => void stop()} disabled={busy} className="ml-auto underline underline-offset-2 hover:text-ink">
            Stop keeping in step
          </button>
        </div>
      )}
      <button onClick={() => void run()} disabled={busy} className="bg-btn hover:bg-btn-hover disabled:opacity-60 px-4 py-2 rounded-full font-medium flex items-center gap-2">
        {busy && <Loader2 size={14} className="animate-spin" />} {st.lastSyncedAt ? "Check Outlook for new contacts" : "Import Outlook contacts"}
      </button>
      {done && <Done text={done} />}
    </div>
  );
}

const HOW: Record<Exclude<ImportSource, "outlook">, React.ReactNode> = {
  iphone: (
    <>
      <b>On iPhone</b> (iOS 16 or later): open <b>Contacts</b> → tap <b>Lists</b> (top left) → touch and hold <b>All iCloud</b> or <b>All Contacts</b> → <b>Export</b> → save or email the file to yourself.
      <br />
      <b>Or on a computer:</b> go to icloud.com/contacts → select the contacts (or all of them) → open the menu (<b>…</b> or the gear) → <b>Export vCard</b>.
      <br />
      Then choose the <b>.vcf</b> file below.
    </>
  ),
  ringcentral: (
    <>
      Export your contacts from RingCentral as a <b>CSV</b> file (if you don&apos;t see an export option, your RingCentral admin can export the company directory). Then choose the
      file below. LawPower finds the name, company, email and phone columns by itself.
    </>
  ),
  csv: (
    <>
      Any spreadsheet saved as <b>CSV</b> with a header row works, including exports from Outlook, Gmail and LEAP. LawPower finds the name, company, email, phone and address columns
      by itself. A <b>.vcf</b> (vCard) file works too.
    </>
  ),
};

function FileImport({ source, busy, setBusy, setError, done, setDone, onImported }: Shared & { source: Exclude<ImportSource, "outlook"> }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; contacts: ImportedContact[]; vcard: boolean } | null>(null);

  async function choose(f: File | undefined) {
    setError(null);
    setDone(null);
    setFile(null);
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) return setError("That file is over 20 MB. Please split it and import it in parts.");
    const text = await f.text();
    const contacts = parseContactsFile(f.name, text);
    if (!contacts.length) return setError("No contacts were found in that file. Check it's a .vcf (vCard) or a .csv with a header row.");
    setFile({ name: f.name, contacts, vcard: /\.vcf$/i.test(f.name) || /^\s*BEGIN:VCARD/i.test(text) });
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const d = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: file.vcard ? "vcard" : "csv", contacts: file.contacts }),
      }).then(readJson);
      setDone(`${d.added === 1 ? "1 contact" : `${d.added} contacts`} added.${d.skipped ? ` ${d.skipped} were already in Contacts and were skipped.` : ""}`);
      setFile(null);
      onImported();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-[13.5px]">
      <p className="text-muted mb-4 leading-relaxed">{HOW[source]}</p>
      <input ref={input} type="file" accept={source === "iphone" ? ".vcf,text/vcard" : ".csv,.vcf,text/csv,text/vcard"} className="hidden" onChange={(e) => void choose(e.target.files?.[0])} />
      <button
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void choose(e.dataTransfer.files?.[0]);
        }}
        disabled={busy}
        className="w-full border-2 border-dashed border-btn rounded-2xl py-7 flex flex-col items-center gap-1.5 hover:bg-cream transition-colors"
      >
        <Upload size={18} className="text-muted" />
        <span className="font-medium">{file ? file.name : "Choose a file or drop it here"}</span>
        <span className="text-[12.5px] text-muted">{source === "iphone" ? ".vcf (vCard)" : ".csv or .vcf"}</span>
      </button>
      {file && (
        <div className="mt-4">
          <div className="font-medium mb-2">
            {file.contacts.length === 1 ? "1 contact" : `${file.contacts.length.toLocaleString()} contacts`} found. First few:
          </div>
          <div className="border border-line rounded-xl overflow-hidden">
            {file.contacts.slice(0, 5).map((c, i) => (
              <div key={i} className="px-3 py-2 border-b border-line last:border-0 flex gap-3">
                <span className="font-medium truncate">{c.name}</span>
                <span className="text-muted truncate">{[c.company, c.email, c.phone].filter(Boolean).join(" · ")}</span>
              </div>
            ))}
          </div>
          <button onClick={() => void run()} disabled={busy} className="mt-4 bg-btn hover:bg-btn-hover disabled:opacity-60 px-4 py-2 rounded-full font-medium flex items-center gap-2">
            {busy && <Loader2 size={14} className="animate-spin" />} Import {file.contacts.length === 1 ? "1 contact" : `${file.contacts.length.toLocaleString()} contacts`}
          </button>
        </div>
      )}
      {done && <Done text={done} />}
    </div>
  );
}
