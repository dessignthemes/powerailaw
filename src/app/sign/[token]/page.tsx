"use client";

import { use, useEffect, useRef, useState } from "react";
import { Loader2, Check, X, PenLine, Download, ShieldCheck } from "lucide-react";
import PdfPages from "@/components/esign/PdfPages";
import type { SignField } from "@/lib/esign/types";

type View = {
  status: "sent" | "viewed" | "signed" | "declined" | "cancelled" | "expired";
  documentTitle: string;
  firm: string;
  senderEmail: string | null;
  signerName: string;
  signerEmail: string;
  message: string;
  fields: SignField[];
  pdfUrl: string | null;
  signedUrl: string | null;
  consentText: string;
};

const todayUS = () => new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

export default function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [padFor, setPadFor] = useState<SignField | null>(null);
  const [adopted, setAdopted] = useState<{ signature?: string; initials?: string }>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | "signed" | "declined">(null);
  const [width, setWidth] = useState(820);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/sign/${token}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error ?? "This signing link isn't valid.");
        return d as View;
      })
      .then(async (v) => {
        if (cancelled) return;
        setView(v);
        const init: Record<string, unknown> = {};
        for (const f of v.fields) if (f.type === "name") init[f.id] = v.signerName;
        setValues(init);
        if (v.pdfUrl) {
          const b = await fetch(v.pdfUrl).then((r) => r.arrayBuffer());
          if (!cancelled) setBytes(new Uint8Array(b));
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.min(820, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  const fields = view?.fields ?? [];
  const isDone = (f: SignField) =>
    f.type === "date" ? true : f.type === "checkbox" ? values[f.id] === true || !f.required : f.type === "signature" || f.type === "initials" ? typeof values[f.id] === "string" : !!String(values[f.id] ?? "").trim() || !f.required;
  const required = fields.filter((f) => f.required);
  const completed = required.filter(isDone).length;
  const allDone = completed === required.length;

  function clickField(f: SignField) {
    if (f.type !== "signature" && f.type !== "initials") return;
    const saved = f.type === "signature" ? adopted.signature : adopted.initials;
    if (saved && !values[f.id]) setValues((v) => ({ ...v, [f.id]: saved }));
    else setPadFor(f);
  }

  function nextField() {
    const f = required.find((x) => !isDone(x));
    if (!f) return;
    document.getElementById(`field-${f.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function submit(action: "sign" | "decline", reason?: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/public/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "sign" ? { action, values, consent } : { action, reason }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? "That didn't work. Please try again.");
      setDone(action === "sign" ? "signed" : "declined");
      if (action === "sign") {
        const v = await fetch(`/api/public/sign/${token}`).then((x) => x.json()).catch(() => null);
        if (v) setView(v);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-page">
      <header className="border-b border-line bg-white">
        <div className="max-w-[900px] mx-auto px-5 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold truncate">{view?.firm || "Signature request"}</div>
            {view && <div className="text-[12.5px] text-muted truncate">{view.documentTitle}</div>}
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-muted"><ShieldCheck size={14} /> Secure signing by LawPower AI</div>
        </div>
      </header>
      {children}
    </div>
  );

  if (error && !view) return shell(<div className="max-w-[560px] mx-auto mt-20 text-center px-5"><div className="text-[18px] font-semibold mb-2">This link can’t be opened</div><p className="text-[14px] text-muted">{error}</p></div>);
  if (!view) return shell(<div className="mt-24 flex justify-center text-muted gap-2"><Loader2 className="animate-spin" size={18} /> Loading…</div>);

  if (done === "declined" || view.status === "declined") return shell(<Message title="You declined to sign" text={`We let ${view.senderEmail ?? "the sender"} know. You can close this page.`} />);
  if (done === "signed" || view.status === "signed")
    return shell(
      <Message title="Thank you, it’s signed" text="Your signed copy has been sent back to the firm. You can download a copy for your records.">
        {view.signedUrl && (
          <a href={view.signedUrl} className="inline-flex mt-5 bg-btn hover:bg-btn-hover px-5 py-2.5 rounded-full text-[14px] font-medium items-center gap-1.5"><Download size={15} /> Download signed copy</a>
        )}
      </Message>
    );
  if (view.status === "cancelled") return shell(<Message title="This request was cancelled" text="The sender cancelled this signature request. Contact them if you think this is a mistake." />);
  if (view.status === "expired") return shell(<Message title="This link has expired" text={`Ask ${view.senderEmail ?? "the sender"} to send you a new link.`} />);

  return shell(
    <>
      <div className="max-w-[900px] mx-auto px-5 pt-6">
        <div className="bg-white border border-line rounded-2xl p-5 mb-5">
          <div className="text-[15px] font-semibold">Hello {view.signerName},</div>
          {view.message && <p className="text-[14px] mt-1 whitespace-pre-wrap">{view.message}</p>}
          <p className="text-[13px] text-muted mt-2">Review the document and complete the highlighted fields. Sent by {view.senderEmail ?? "the firm"}.</p>
        </div>
      </div>
      <div ref={wrapRef} className="max-w-[900px] mx-auto px-4 pb-40">
        {!bytes ? (
          <div className="py-16 flex justify-center text-muted gap-2"><Loader2 className="animate-spin" size={18} /> Loading document…</div>
        ) : (
          <PdfPages
            bytes={bytes}
            width={width}
            overlay={(page) =>
              fields.filter((f) => f.page === page).map((f) => {
                const v = values[f.id];
                const ok = isDone(f);
                const style = { left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` };
                const ring = ok ? "border-[#3B6BA5]/40 bg-transparent" : "border-[#F59E0B] bg-[#FFF7E6]/80";
                return (
                  <div key={f.id} id={`field-${f.id}`} className={`absolute pointer-events-auto rounded border-2 ${ring}`} style={style}>
                    {f.type === "signature" || f.type === "initials" ? (
                      <button onClick={() => clickField(f)} className="w-full h-full flex items-center justify-center text-[11px] font-medium text-[#1f3a93]">
                        {typeof v === "string" ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={v} alt="" className="max-w-full max-h-full object-contain" />
                        ) : (
                          <span className="flex items-center gap-1"><PenLine size={12} /> {f.type === "signature" ? "Sign here" : "Initial"}</span>
                        )}
                      </button>
                    ) : f.type === "date" ? (
                      <div className="w-full h-full flex items-center px-1 text-[12px] text-[#1f3a93]">{todayUS()}</div>
                    ) : f.type === "checkbox" ? (
                      <label className="w-full h-full flex items-center justify-center cursor-pointer">
                        <input type="checkbox" checked={v === true} onChange={(e) => setValues((x) => ({ ...x, [f.id]: e.target.checked }))} className="accent-black w-full h-full" aria-label={f.label} />
                      </label>
                    ) : (
                      <input
                        value={String(v ?? "")}
                        onChange={(e) => setValues((x) => ({ ...x, [f.id]: e.target.value }))}
                        placeholder={f.label}
                        className="w-full h-full bg-transparent px-1 text-[12px] text-[#1f3a93] outline-none placeholder:text-[#1f3a93]/50"
                      />
                    )}
                  </div>
                );
              })
            }
          />
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-line shadow-[0_-8px_24px_rgba(20,24,33,0.08)]">
        <div className="max-w-[900px] mx-auto px-5 py-3.5 flex items-center gap-3 flex-wrap">
          <div className="text-[13px] text-muted">{completed} of {required.length} required fields done</div>
          {!allDone && <button onClick={nextField} className="bg-chip hover:bg-line/70 px-3.5 py-1.5 rounded-full text-[13px] font-medium">Next field</button>}
          <label className="flex items-start gap-2 text-[12.5px] flex-1 min-w-[260px]">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="accent-black mt-0.5" />
            <span>{view.consentText}</span>
          </label>
          {error && <div className="w-full text-[13px] text-red-700">{error}</div>}
          <button
            onClick={() => { const reason = prompt("Optional: tell the sender why you’re declining."); if (reason !== null) void submit("decline", reason); }}
            disabled={busy}
            className="text-[13px] text-muted hover:text-ink px-2"
          >
            Decline
          </button>
          <button onClick={() => submit("sign")} disabled={busy || !allDone || !consent} className="bg-btn hover:bg-btn-hover px-5 py-2.5 rounded-full text-[14px] font-medium flex items-center gap-1.5 disabled:opacity-50">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Finish and sign
          </button>
        </div>
      </div>

      {padFor && (
        <SignaturePad
          kind={padFor.type === "initials" ? "initials" : "signature"}
          defaultText={padFor.type === "initials" ? view.signerName.split(/\s+/).map((w) => w[0]).join("").toUpperCase() : view.signerName}
          onClose={() => setPadFor(null)}
          onAdopt={(png) => {
            const k = padFor.type === "initials" ? "initials" : "signature";
            setAdopted((a) => ({ ...a, [k]: png }));
            setValues((v) => ({ ...v, [padFor.id]: png }));
            setPadFor(null);
          }}
        />
      )}
    </>
  );
}

function Message({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="max-w-[560px] mx-auto mt-20 text-center px-5">
      <div className="text-[20px] font-semibold mb-2">{title}</div>
      <p className="text-[14px] text-muted">{text}</p>
      {children}
    </div>
  );
}

function SignaturePad({ kind, defaultText, onClose, onAdopt }: { kind: "signature" | "initials"; defaultText: string; onClose: () => void; onAdopt: (png: string) => void }) {
  const [mode, setMode] = useState<"draw" | "type">("type");
  const [text, setText] = useState(defaultText);
  const [drawn, setDrawn] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const W = 560, H = 180;

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    if (mode === "type" && text.trim()) {
      let size = kind === "initials" ? 90 : 64;
      ctx.fillStyle = "#14215c";
      do {
        ctx.font = `italic ${size}px "Brush Script MT", "Segoe Script", "Snell Roundhand", cursive`;
        size -= 2;
      } while (ctx.measureText(text).width > W - 40 && size > 20);
      ctx.textBaseline = "middle";
      ctx.fillText(text, 20, H / 2);
    }
  }, [mode, text, kind]);

  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (mode !== "draw") return;
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    const r = c.getBoundingClientRect();
    const pt = (ev: PointerEvent | React.PointerEvent) => [((ev.clientX - r.left) / r.width) * W, ((ev.clientY - r.top) / r.height) * H] as const;
    ctx.strokeStyle = "#14215c";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(...pt(e));
    c.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      ctx.lineTo(...pt(ev));
      ctx.stroke();
      setDrawn(true);
    };
    const up = () => {
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
    };
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
  }

  const ready = mode === "type" ? !!text.trim() : drawn;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-[620px] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[17px] font-semibold">{kind === "initials" ? "Your initials" : "Your signature"}</div>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="flex gap-2 mb-3">
          {(["type", "draw"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setDrawn(false); }} className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium capitalize ${mode === m ? "bg-btn ring-1 ring-inset ring-btn-ring" : "bg-chip hover:bg-line/70"}`}>{m}</button>
          ))}
        </div>
        {mode === "type" && <input value={text} onChange={(e) => setText(e.target.value)} className="w-full border border-line rounded-lg px-3 py-2 text-[14px] mb-3 outline-none focus:border-ink" />}
        <canvas ref={canvas} width={W} height={H} onPointerDown={startDraw} className={`w-full border border-line rounded-xl bg-white touch-none ${mode === "draw" ? "cursor-crosshair" : ""}`} style={{ aspectRatio: `${W}/${H}` }} />
        <div className="flex items-center justify-between mt-4">
          {mode === "draw" ? (
            <button onClick={() => { canvas.current!.getContext("2d")!.clearRect(0, 0, W, H); setDrawn(false); }} className="text-[13px] text-muted hover:text-ink">Clear</button>
          ) : <span className="text-[12px] text-muted">By adopting, you agree this is your electronic {kind}.</span>}
          <button onClick={() => onAdopt(canvas.current!.toDataURL("image/png"))} disabled={!ready} className="bg-btn hover:bg-btn-hover px-4 py-2 rounded-full text-[13.5px] font-medium disabled:opacity-50">
            Adopt and sign
          </button>
        </div>
      </div>
    </div>
  );
}
