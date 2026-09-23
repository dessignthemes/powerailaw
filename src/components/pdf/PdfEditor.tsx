"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PDFFont } from "pdf-lib";
import {
  ArrowLeft,
  Type,
  PenTool,
  Replace,
  Save,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Trash2,
  Loader2,
  MousePointer2,
  AlertTriangle,
  Info,
  X,
  Check,
} from "lucide-react";
import { loadPdfjs, openPdf, openProblemMessages, type PdfDoc, type PdfPage } from "@/lib/pdf/pdfjsClient";
import { fetchVersionBytes, uploadNewVersion, UploadError } from "@/lib/pdf/upload";
import {
  buildEditedPdf,
  readFormFields,
  getHelvetica,
  wrapText,
  textBoxHeight,
  unsupportedChars,
  textColors,
  FIRST_BASELINE,
  LINE_HEIGHT,
  ExportError,
  type OverlayItem,
  type TextItem,
  type ReplaceItem,
  type SignatureItem,
  type PageGeometry,
  type FormFieldInfo,
  type FormWidget,
  type TextColor,
} from "@/lib/pdf/editorModel";
import SignatureModal, { type CapturedSignature } from "@/components/pdf/SignatureModal";
import { formatWhen, type Doc, type DocVersion } from "@/components/pdf/DocumentList";

type Viewport = ReturnType<PdfPage["getViewport"]>;
type Geo = PageGeometry & { vp: Viewport };
type Tool = "select" | "text" | "replace";

type TextRun = { x: number; y: number; w: number; h: number; str: string; size: number; baseline: number };

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const TEXT_FONT_CSS = 'Arial, "Liberation Sans", Helvetica, sans-serif'; // metric-compatible with PDF Helvetica
const MIN_W = 24;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export default function PdfEditor({
  documentId,
  versionId,
  justSaved = false,
}: {
  documentId: string;
  versionId: string | null;
  justSaved?: boolean;
}) {
  const router = useRouter();

  // ── Loading ────────────────────────────────────────────────────────────
  const [doc, setDoc] = useState<Doc | null>(null);
  const [version, setVersion] = useState<DocVersion | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [geos, setGeos] = useState<Geo[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [font, setFont] = useState<PDFFont | null>(null);
  const [fields, setFields] = useState<FormFieldInfo[]>([]);
  const [widgets, setWidgets] = useState<FormWidget[]>([]);
  const [scanned, setScanned] = useState(false);

  // ── Editing ────────────────────────────────────────────────────────────
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<Tool>("select");
  const [items, setItems] = useState<OverlayItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>({});
  const [runs, setRuns] = useState<TextRun[]>([]);
  const [sigModal, setSigModal] = useState<{ target?: { x: number; y: number; w: number; h: number } } | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [notice] = useState<string | null>(
    justSaved ? "Saved as a new version. The previous version is unchanged." : null
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelTextRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [rootHeight, setRootHeight] = useState<number | null>(null);
  const drag = useRef<{
    id: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    orig: OverlayItem;
  } | null>(null);

  const geo = geos[pageIndex];
  const selected = items.find((i) => i.id === selectedId) ?? null;
  const dirty = items.length > 0 || Object.keys(formValues).length > 0;

  useEffect(() => {
    let cancelled = false;
    let close: (() => Promise<void>) | null = null;
    (async () => {
      try {
        const res = await fetch(`/api/documents/${documentId}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "Couldn't open this document.");
        const d: Doc = data.document;
        const v = d.versions.find((x) => x.id === versionId) ?? d.versions[0];
        if (!v) throw new Error("This document has no saved versions.");
        const [b, helv] = await Promise.all([fetchVersionBytes(v.id), getHelvetica()]);
        const opened = await openPdf(b);
        if ("problem" in opened) throw new Error(openProblemMessages[opened.problem]);
        close = opened.close;

        const gs: Geo[] = [];
        for (let i = 1; i <= opened.doc.numPages; i++) {
          const page = await opened.doc.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          gs.push({
            width: vp.width,
            height: vp.height,
            rotation: vp.rotation,
            toPdf: (x, y) => vp.convertToPdfPoint(x, y) as [number, number],
            vp,
          });
        }

        let form = { fields: [] as FormFieldInfo[], widgets: [] as FormWidget[] };
        try {
          form = await readFormFields(b);
        } catch {
          // Unreadable form structure: the page still renders, fields just aren't offered.
        }

        // Scanned check: no extractable text on the first few pages.
        // Best effort: if text can't be read, assume it's not scanned rather than fail.
        let textFound = true;
        try {
          textFound = false;
          for (let i = 1; i <= Math.min(3, opened.doc.numPages) && !textFound; i++) {
            const tc = await (await opened.doc.getPage(i)).getTextContent();
            textFound = tc.items.some((it) => "str" in it && it.str.trim().length > 0);
          }
        } catch (err) {
          console.warn("Text check failed:", err);
          textFound = true;
        }

        if (cancelled) return;
        setDoc(d);
        setVersion(v);
        setBytes(b);
        setPdf(opened.doc);
        setGeos(gs);
        setFont(helv);
        setFields(form.fields);
        setWidgets(form.widgets);
        setScanned(!textFound && form.fields.length === 0);
        const avail = (scrollRef.current?.clientWidth ?? 900) - 64;
        setZoom(ZOOMS.reduce((best, z) => (gs[0].width * z <= avail && z <= 1.5 ? z : best), 0.5));
      } catch (e) {
        console.error("Power PDF failed to open document:", e);
        if (cancelled) return;
        // Our own messages are written for people; anything else is a browser/library error.
        const msg = e instanceof Error ? e.message : "";
        const ours = msg && !/is not a function|undefined|null|TypeError|ReferenceError|Cannot read/i.test(msg);
        setLoadError(
          ours
            ? msg
            : "This PDF couldn't be opened in your browser. Try refreshing the page; if it keeps happening, try Chrome and let us know which browser failed."
        );
      }
    })();
    return () => {
      cancelled = true;
      close?.();
    };
  }, [documentId, versionId]);

  // Render the current page. The canvas is drawn at zoom × devicePixelRatio
  // for sharpness; CSS size is page units × zoom, matching the overlay.
  useEffect(() => {
    if (!pdf || !geo || !canvasRef.current) return;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    let cancelled = false;
    (async () => {
      const pdfjs = await loadPdfjs();
      const page = await pdf.getPage(pageIndex + 1);
      if (cancelled || !canvasRef.current) return;
      const dpr = window.devicePixelRatio || 1;
      const vp = page.getViewport({ scale: zoom * dpr });
      const canvas = canvasRef.current;
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      task = page.render({ canvas, viewport: vp, annotationMode: pdfjs.AnnotationMode.ENABLE_FORMS });
      await task.promise.catch(() => {});
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, geo, pageIndex, zoom]);

  // Text runs for "Replace text" mode (current page only).
  useEffect(() => {
    if (tool !== "replace" || !pdf || !geo) return;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageIndex + 1);
      let tc;
      try {
        tc = await page.getTextContent();
      } catch (err) {
        console.warn("Couldn't read page text:", err);
        if (!cancelled) setRuns([]);
        return;
      }
      const out: TextRun[] = [];
      for (const it of tc.items) {
        if (!("str" in it) || !it.str.trim()) continue;
        const [a, b, c, d, e, f] = it.transform as number[];
        const size = Math.hypot(c, d) || Math.hypot(a, b);
        const len = Math.hypot(a, b) || 1;
        const [x1, y1] = geo.vp.convertToViewportPoint(e, f);
        const [x2, y2] = geo.vp.convertToViewportPoint(e + (a / len) * it.width, f + (b / len) * it.width);
        if (Math.abs(y2 - y1) > 1 || x2 <= x1) continue; // only horizontal, left-to-right text
        const top = y1 - size * 0.95;
        const bottom = y1 + size * 0.28;
        out.push({ x: x1 - 1, y: top - 1, w: x2 - x1 + 2, h: bottom - top + 2, str: it.str, size, baseline: y1 - (top - 1) });
      }
      if (!cancelled) setRuns(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [tool, pdf, geo, pageIndex]);

  // Fill the viewport below the dashboard header so the page area scrolls, not the window.
  useEffect(() => {
    const fit = () => {
      const top = rootRef.current?.getBoundingClientRect().top ?? 0;
      setRootHeight(Math.max(420, window.innerHeight - top - window.scrollY));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [doc]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ── Item helpers ───────────────────────────────────────────────────────

  const itemHeight = useCallback(
    (it: OverlayItem) => {
      if (it.kind !== "text") return it.h;
      const lines = font ? wrapText(font, it.text || " ", it.fontSize, it.w).length : 1;
      return textBoxHeight(lines, it.fontSize);
    },
    [font]
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<OverlayItem>) =>
      setItems((xs) => xs.map((x) => (x.id === id ? ({ ...x, ...patch } as OverlayItem) : x))),
    []
  );

  const deleteItem = useCallback((id: string) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    setSelectedId(null);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (!selected || !geo) {
        if (e.key === "Escape") setTool("select");
        return;
      }
      if (e.key === "Escape") setSelectedId(null);
      else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteItem(selected.id);
      } else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        updateItem(selected.id, {
          x: clamp(selected.x + dx, 0, geo.width - selected.w),
          y: clamp(selected.y + dy, 0, geo.height - itemHeight(selected)),
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, geo, deleteItem, updateItem, itemHeight]);

  function pagePoint(e: React.PointerEvent | React.MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  }

  function onPageClick(e: React.MouseEvent) {
    if (!geo) return;
    if (tool === "text") {
      const p = pagePoint(e);
      const w = Math.min(220, geo.width - 8);
      const item: TextItem = {
        id: crypto.randomUUID(),
        kind: "text",
        page: pageIndex,
        x: clamp(p.x, 0, geo.width - w),
        y: clamp(p.y - 7, 0, geo.height - 16),
        w,
        text: "",
        fontSize: 12,
        color: "black",
      };
      setItems((xs) => [...xs, item]);
      setSelectedId(item.id);
      setTool("select");
      setTimeout(() => panelTextRef.current?.focus(), 30);
      return;
    }
    if (e.target === e.currentTarget) setSelectedId(null);
  }

  function sampleCover(r: TextRun): [number, number, number] {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d", { willReadFrequently: true });
    if (!c || !ctx) return [1, 1, 1];
    const s = c.width / (geo?.width ?? 1);
    const pts = [
      [r.x - 2, r.y - 2],
      [r.x + r.w + 2, r.y - 2],
      [r.x - 2, r.y + r.h + 2],
      [r.x + r.w + 2, r.y + r.h + 2],
    ];
    let R = 0, G = 0, B = 0, n = 0;
    for (const [x, y] of pts) {
      const px = Math.round(x * s), py = Math.round(y * s);
      if (px < 0 || py < 0 || px >= c.width || py >= c.height) continue;
      const d = ctx.getImageData(px, py, 1, 1).data;
      R += d[0]; G += d[1]; B += d[2]; n++;
    }
    if (!n) return [1, 1, 1];
    return [R / n / 255, G / n / 255, B / n / 255];
  }

  function startReplace(r: TextRun) {
    const item: ReplaceItem = {
      id: crypto.randomUUID(),
      kind: "replace",
      page: pageIndex,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      text: r.str,
      originalText: r.str,
      fontSize: Math.round(r.size * 10) / 10,
      baseline: r.baseline,
      color: "black",
      cover: sampleCover(r),
    };
    setItems((xs) => [...xs, item]);
    setSelectedId(item.id);
    setTool("select");
    setTimeout(() => {
      const el = panelTextRef.current;
      el?.focus();
      if (el && "select" in el) el.select();
    }, 30);
  }

  function placeSignature(sig: CapturedSignature) {
    if (!geo) return;
    const target = sigModal?.target;
    let w: number, h: number, x: number, y: number;
    if (target) {
      // Fit inside the form's signature box, keeping the image's shape.
      w = Math.min(target.w, target.h * sig.aspect);
      h = w / sig.aspect;
      x = target.x + (target.w - w) / 2;
      y = target.y + (target.h - h) / 2;
    } else {
      w = Math.min(170, geo.width * 0.4);
      h = w / sig.aspect;
      x = (geo.width - w) / 2;
      y = (geo.height - h) / 2;
    }
    const item: SignatureItem = {
      id: crypto.randomUUID(),
      kind: "signature",
      page: pageIndex,
      x,
      y,
      w,
      h,
      pngDataUrl: sig.pngDataUrl,
      aspect: sig.aspect,
    };
    setItems((xs) => [...xs, item]);
    setSelectedId(item.id);
    setSigModal(null);
    setTool("select");
  }

  // ── Drag / resize (all maths in page units, so zoom never leaks in) ────

  function onItemPointerDown(e: React.PointerEvent, it: OverlayItem, mode: "move" | "resize") {
    e.stopPropagation();
    if (tool !== "select") setTool("select");
    setSelectedId(it.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: it.id, mode, startX: e.clientX, startY: e.clientY, orig: it };
  }

  function onItemPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !geo) return;
    const dx = (e.clientX - d.startX) / zoom;
    const dy = (e.clientY - d.startY) / zoom;
    const o = d.orig;
    if (d.mode === "move") {
      updateItem(o.id, {
        x: clamp(o.x + dx, 0, geo.width - o.w),
        y: clamp(o.y + dy, 0, geo.height - itemHeight(o)),
      });
      return;
    }
    const w = clamp(o.w + dx, MIN_W, geo.width - o.x);
    if (o.kind === "signature") {
      const h = w / o.aspect;
      if (o.y + h > geo.height) return;
      updateItem(o.id, { w, h });
    } else if (o.kind === "replace") {
      updateItem(o.id, { w, h: clamp(o.h + dy, 6, geo.height - o.y) });
    } else {
      updateItem(o.id, { w });
    }
  }

  function onItemPointerUp() {
    drag.current = null;
  }

  // ── Save ───────────────────────────────────────────────────────────────

  const exportable = items.filter((i) => !(i.kind === "text" && !i.text.trim()));
  const replacements = exportable.filter((i) => i.kind === "replace");
  const charProblems = useMemo(() => {
    if (!font) return [];
    const bad = new Set<string>();
    for (const it of items) if (it.kind !== "signature") unsupportedChars(font, it.text).forEach((c) => bad.add(c));
    for (const [name, v] of Object.entries(formValues)) {
      if (typeof v === "string" && fields.find((f) => f.name === name)?.kind === "text") {
        unsupportedChars(font, v).forEach((c) => bad.add(c));
      }
    }
    return [...bad];
  }, [items, formValues, fields, font]);

  async function save(note: string) {
    if (!bytes || !doc || !version) return;
    const out = await buildEditedPdf({
      original: bytes,
      pages: geos,
      items: exportable,
      formValues,
      formFields: fields,
    });
    const updated: Doc = await uploadNewVersion(doc.id, out, version.id, note);
    const newest = updated.versions[0];
    setItems([]);
    setFormValues({});
    setSaveOpen(false);
    router.replace(`/dashboard/power-pdf/${doc.id}?version=${newest.id}&saved=1`);
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="px-10 py-10 max-w-[720px]">
        <Link href="/dashboard/power-pdf" className="text-[13.5px] text-muted hover:text-ink flex items-center gap-1 mb-6">
          <ArrowLeft size={14} /> Power PDF
        </Link>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-[14px] text-red-700 flex gap-3">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <span>{loadError}</span>
        </div>
      </div>
    );
  }

  if (!doc || !version || !geo) {
    return (
      <div className="flex items-center justify-center h-screen text-[14px] text-muted gap-2">
        <Loader2 size={16} className="animate-spin" /> Opening PDF…
      </div>
    );
  }

  const pageWidgets = widgets.filter((w) => w.page === pageIndex);
  const pageItems = items.filter((i) => i.page === pageIndex);
  const isLatest = doc.versions[0]?.id === version.id;
  const fillable = fields.filter((f) => f.kind !== "unsupported" && f.kind !== "signature").length;

  const toolBtn = (t: Tool, icon: React.ReactNode, label: string, hint: string) => (
    <button
      onClick={() => {
        setTool(tool === t ? "select" : t);
        setSelectedId(null);
      }}
      title={hint}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
        tool === t ? "bg-dark text-white" : "bg-card-alt text-ink hover:bg-line/60"
      }`}
    >
      {icon} {label}
    </button>
  );

  return (
    <div ref={rootRef} className="flex flex-col mt-3" style={{ height: rootHeight ?? "calc(100vh - 80px)" }}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-line flex-wrap bg-cream">
        <Link href="/dashboard/power-pdf" className="text-muted hover:text-ink" aria-label="Back to Power PDF">
          <ArrowLeft size={17} />
        </Link>
        <div className="min-w-0 mr-2">
          <div className="text-[14px] font-semibold truncate max-w-[260px]">{doc.title}</div>
          <div className="text-[12px] text-muted">
            {doc.matterTitle}, version {version.versionNumber}
            {!isLatest && " (older version)"}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {toolBtn("select", <MousePointer2 size={13} />, "Select", "Select, move and resize items")}
          {toolBtn("text", <Type size={13} />, "Text", "Click on the page to add a text box")}
          <button
            onClick={() => {
              setSelectedId(null);
              setSigModal({});
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium bg-card-alt hover:bg-line/60 transition-colors"
          >
            <PenTool size={13} /> Signature
          </button>
          {!scanned &&
            toolBtn(
              "replace",
              <Replace size={13} />,
              "Replace text",
              "Cover a piece of existing text and type a correction. The original stays in the file."
            )}
        </div>

        <div className="flex items-center gap-1 ml-auto text-[13px]">
          <button
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            disabled={pageIndex === 0}
            className="w-8 h-8 rounded-full hover:bg-card-alt flex items-center justify-center disabled:opacity-30"
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="tabular-nums px-1">
            Page{" "}
            <input
              value={pageIndex + 1}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!isNaN(n)) setPageIndex(clamp(n - 1, 0, geos.length - 1));
              }}
              className="w-9 text-center bg-card-alt rounded-md py-0.5 outline-none"
              aria-label="Page number"
            />{" "}
            of {geos.length}
          </span>
          <button
            onClick={() => setPageIndex((p) => Math.min(geos.length - 1, p + 1))}
            disabled={pageIndex >= geos.length - 1}
            className="w-8 h-8 rounded-full hover:bg-card-alt flex items-center justify-center disabled:opacity-30"
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>

          <span className="w-px h-5 bg-line mx-2" />
          <button
            onClick={() => setZoom((z) => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)] ?? z)}
            className="w-8 h-8 rounded-full hover:bg-card-alt flex items-center justify-center"
            aria-label="Zoom out"
          >
            <Minus size={15} />
          </button>
          <span className="w-11 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)] ?? z)}
            className="w-8 h-8 rounded-full hover:bg-card-alt flex items-center justify-center"
            aria-label="Zoom in"
          >
            <Plus size={15} />
          </button>
        </div>

        <button
          onClick={() => setSaveOpen(true)}
          disabled={!dirty}
          className="bg-dark text-white px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 hover:bg-dark2 transition-colors disabled:opacity-40"
        >
          <Save size={14} strokeWidth={2} /> Save as new version
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Page */}
        <div ref={scrollRef} className="flex-1 overflow-auto bg-card-alt">
          {tool !== "select" && (
            <div className="sticky top-0 z-20 flex justify-center pointer-events-none">
              <div className="mt-3 bg-dark text-white text-[12.5px] px-3.5 py-1.5 rounded-full pointer-events-auto flex items-center gap-2">
                {tool === "text"
                  ? "Click where the text should start."
                  : "Click a highlighted piece of text to replace it. The original is covered, not removed."}
                <button onClick={() => setTool("select")} aria-label="Cancel" className="opacity-70 hover:opacity-100">
                  <X size={13} />
                </button>
              </div>
            </div>
          )}
          <div className="p-8 flex justify-center min-w-fit">
            <div
              className="relative bg-white shadow-[0_2px_16px_rgba(18,17,16,0.12)]"
              style={{ width: geo.width * zoom, height: geo.height * zoom }}
            >
              <canvas
                ref={canvasRef}
                className="absolute inset-0"
                style={{ width: geo.width * zoom, height: geo.height * zoom }}
              />
              <div
                className={`absolute inset-0 ${tool === "text" ? "cursor-text" : ""}`}
                onClick={onPageClick}
              >
                {/* Form fields */}
                {pageWidgets.map((w, i) => (
                  <FieldInput
                    key={`${w.fieldName}-${i}`}
                    widget={w}
                    field={fields.find((f) => f.name === w.fieldName)}
                    vp={geo.vp}
                    zoom={zoom}
                    value={formValues[w.fieldName]}
                    onChange={(v) => setFormValues((fv) => ({ ...fv, [w.fieldName]: v }))}
                    onSignatureField={(rect) => setSigModal({ target: rect })}
                  />
                ))}

                {/* Replace-text targets */}
                {tool === "replace" &&
                  runs.map((r, i) => (
                    <button
                      key={i}
                      onClick={(e) => {
                        e.stopPropagation();
                        startReplace(r);
                      }}
                      title={r.str}
                      className="absolute bg-amber-300/25 hover:bg-amber-300/50 outline outline-1 outline-amber-500/50 rounded-[2px]"
                      style={{ left: r.x * zoom, top: r.y * zoom, width: r.w * zoom, height: r.h * zoom }}
                    />
                  ))}

                {/* Overlay items */}
                {pageItems.map((it) => {
                  const h = itemHeight(it);
                  const isSel = it.id === selectedId;
                  return (
                    <div
                      key={it.id}
                      onPointerDown={(e) => onItemPointerDown(e, it, "move")}
                      onPointerMove={onItemPointerMove}
                      onPointerUp={onItemPointerUp}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={() => panelTextRef.current?.focus()}
                      className={`absolute touch-none select-none ${tool === "select" ? "cursor-move" : ""} ${
                        isSel ? "outline outline-2 outline-[#3B82F6]" : "hover:outline hover:outline-1 hover:outline-[#3B82F6]/60"
                      } ${it.kind === "text" && !it.text ? "outline-dashed outline-1 outline-[#3B82F6]" : ""}`}
                      style={{ left: it.x * zoom, top: it.y * zoom, width: it.w * zoom, height: h * zoom }}
                    >
                      <ItemVisual item={it} zoom={zoom} font={font} />
                      {isSel && (
                        <div
                          onPointerDown={(e) => onItemPointerDown(e, it, "resize")}
                          onPointerMove={onItemPointerMove}
                          onPointerUp={onItemPointerUp}
                          className="absolute -right-[6px] -bottom-[6px] w-3 h-3 bg-white border-2 border-[#3B82F6] rounded-sm cursor-nwse-resize"
                          aria-label="Resize"
                        />
                      )}
                      {isSel && it.kind === "replace" && (
                        <div className="absolute left-0 -top-6 whitespace-nowrap text-[11px] font-medium bg-amber-100 text-amber-900 border border-amber-300 rounded px-1.5 py-0.5">
                          Replacement: covers the original, doesn’t delete it
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Side panel */}
        <aside className="w-[300px] flex-shrink-0 border-l border-line bg-cream overflow-y-auto p-5 text-[13.5px]">
          {selected ? (
            <SelectedPanel
              item={selected}
              font={font}
              inputRef={panelTextRef}
              onChange={(patch) => updateItem(selected.id, patch)}
              onDelete={() => deleteItem(selected.id)}
            />
          ) : (
            <div className="flex flex-col gap-4">
              {notice && (
                <div className="rounded-xl bg-[#DCEBD8] text-[#2F5E2A] px-3.5 py-2.5 flex gap-2">
                  <Check size={15} className="flex-shrink-0 mt-0.5" /> {notice}
                </div>
              )}
              {!isLatest && (
                <div className="rounded-xl bg-[#F5E3B3] text-[#6B5415] px-3.5 py-2.5">
                  You’re viewing version {version.versionNumber}. Saving creates a new latest version based on this
                  one; nothing is overwritten.
                </div>
              )}
              {scanned && (
                <div className="rounded-xl bg-card-alt px-3.5 py-3 flex gap-2">
                  <Info size={15} className="flex-shrink-0 mt-0.5 text-muted" />
                  <span>
                    This looks like a scanned document (the pages are images), so its text can’t be selected or
                    replaced. You can still add text boxes and signatures on top.
                  </span>
                </div>
              )}
              <div>
                <div className="font-semibold mb-1.5">How to edit</div>
                <ul className="text-muted flex flex-col gap-1.5 leading-snug">
                  <li><span className="text-ink font-medium">Text</span>: click on the page, then type in this panel.</li>
                  <li><span className="text-ink font-medium">Signature</span>: draw, type or upload, then drag it into place.</li>
                  <li>Drag items to move them; drag the corner handle to resize. Arrow keys nudge.</li>
                  {fillable > 0 && (
                    <li>
                      <span className="text-ink font-medium">Form</span>: this PDF has {fillable} fillable{" "}
                      {fillable === 1 ? "field" : "fields"}, shown in blue. Type straight into them.
                    </li>
                  )}
                </ul>
              </div>
              <div>
                <div className="font-semibold mb-1.5">Changes not yet saved</div>
                <div className="text-muted">
                  {items.length === 0 && Object.keys(formValues).length === 0
                    ? "None yet."
                    : `${items.length} ${items.length === 1 ? "item" : "items"} added, ${Object.keys(formValues).length} form ${
                        Object.keys(formValues).length === 1 ? "field" : "fields"
                      } changed.`}
                </div>
              </div>
              <div>
                <div className="font-semibold mb-1.5">Versions</div>
                <div className="flex flex-col gap-1.5">
                  {doc.versions.map((v) => (
                    <Link
                      key={v.id}
                      href={`/dashboard/power-pdf/${doc.id}?version=${v.id}`}
                      onClick={(e) => {
                        if (dirty && !confirm("Leave without saving your changes?")) e.preventDefault();
                      }}
                      className={`rounded-lg px-2.5 py-1.5 -mx-2.5 hover:bg-card-alt ${v.id === version.id ? "bg-card-alt" : ""}`}
                    >
                      <div className="font-medium">
                        v{v.versionNumber}
                        {v.id === version.id && <span className="text-muted font-normal"> (open)</span>}
                      </div>
                      <div className="text-[12px] text-muted leading-snug">
                        {formatWhen(v.createdAt)}
                        {v.createdByEmail ? `, ${v.createdByEmail}` : ""}
                        {v.note ? `. ${v.note}` : ""}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      {sigModal && <SignatureModal onClose={() => setSigModal(null)} onDone={placeSignature} />}

      {saveOpen && (
        <SaveDialog
          nextVersion={(doc.versions[0]?.versionNumber ?? 0) + 1}
          baseVersion={version.versionNumber}
          replacements={replacements.length}
          signatures={exportable.filter((i) => i.kind === "signature").length}
          charProblems={charProblems}
          onClose={() => setSaveOpen(false)}
          onSave={save}
        />
      )}
    </div>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────

function ItemVisual({ item, zoom, font }: { item: OverlayItem; zoom: number; font: PDFFont | null }) {
  if (item.kind === "signature") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.pngDataUrl} alt="Signature" draggable={false} className="w-full h-full pointer-events-none" />;
  }
  const color = textColors[item.color].css;
  const size = item.fontSize * zoom;
  const lineStyle = {
    fontFamily: TEXT_FONT_CSS,
    fontSize: size,
    lineHeight: `${LINE_HEIGHT * size}px`,
    color,
    whiteSpace: "pre" as const,
  };
  if (item.kind === "replace") {
    const [r, g, b] = item.cover.map((c) => Math.round(c * 255));
    return (
      <div className="w-full h-full relative overflow-visible pointer-events-none" style={{ background: `rgb(${r},${g},${b})` }}>
        <div
          className="absolute left-0"
          style={{ ...lineStyle, top: (item.baseline - item.fontSize * FIRST_BASELINE) * zoom }}
        >
          {item.text}
        </div>
      </div>
    );
  }
  const lines = font ? wrapText(font, item.text, item.fontSize, item.w) : [item.text];
  if (!item.text) {
    return <div className="w-full h-full text-[#3B82F6]/70 pointer-events-none" style={{ ...lineStyle, fontSize: Math.min(size, 12 * zoom) }}>Text</div>;
  }
  return (
    <div className="pointer-events-none">
      {lines.map((l, i) => (
        <div key={i} style={lineStyle}>
          {l || " "}
        </div>
      ))}
    </div>
  );
}

function FieldInput({
  widget,
  field,
  vp,
  zoom,
  value,
  onChange,
  onSignatureField,
}: {
  widget: FormWidget;
  field: FormFieldInfo | undefined;
  vp: Viewport;
  zoom: number;
  value: string | boolean | undefined;
  onChange: (v: string | boolean) => void;
  onSignatureField: (rect: { x: number; y: number; w: number; h: number }) => void;
}) {
  if (!field || field.kind === "unsupported") return null;
  const r = widget.pdfRect;
  const [ax, ay] = vp.convertToViewportPoint(r.x, r.y);
  const [bx, by] = vp.convertToViewportPoint(r.x + r.width, r.y + r.height);
  const x = Math.min(ax, bx), y = Math.min(ay, by), w = Math.abs(bx - ax), h = Math.abs(by - ay);
  const style = { left: x * zoom, top: y * zoom, width: w * zoom, height: h * zoom };
  const current = value ?? field.value;
  const fontSize = clamp(h * 0.62, 7, 13) * zoom;
  const base =
    "absolute bg-[#E8F0FE] border border-[#9DB7E8] rounded-[2px] outline-none focus:border-[#3B82F6] focus:bg-white disabled:opacity-60";

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  if (field.kind === "signature") {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onSignatureField({ x, y, w, h });
        }}
        className="absolute border border-dashed border-[#3B82F6] bg-[#E8F0FE]/60 text-[#1F3A93] rounded-[2px] flex items-center justify-center"
        style={{ ...style, fontSize: clamp(h * 0.35, 8, 12) * zoom }}
        title="Signature field: click to add a visual signature"
      >
        Sign here
      </button>
    );
  }
  if (field.kind === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={Boolean(current)}
        disabled={field.readOnly}
        onChange={(e) => onChange(e.target.checked)}
        onClick={stop}
        className="absolute accent-[#1F3A93] m-0"
        style={style}
        aria-label={field.name}
      />
    );
  }
  if (field.kind === "radio") {
    return (
      <input
        type="radio"
        name={`radio-${field.name}`}
        checked={current === widget.option}
        disabled={field.readOnly}
        onChange={() => widget.option && onChange(widget.option)}
        onClick={stop}
        className="absolute accent-[#1F3A93] m-0"
        style={style}
        aria-label={`${field.name}: ${widget.option}`}
      />
    );
  }
  if (field.kind === "dropdown") {
    return (
      <select
        value={String(current ?? "")}
        disabled={field.readOnly}
        onChange={(e) => onChange(e.target.value)}
        onClick={stop}
        className={base}
        style={{ ...style, fontSize }}
        aria-label={field.name}
      >
        <option value="" />
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  const common = {
    value: String(current ?? ""),
    disabled: field.readOnly,
    maxLength: field.maxLength,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    onClick: stop,
    className: `${base} px-1 font-[Arial,Helvetica,sans-serif]`,
    style: { ...style, fontSize },
    "aria-label": field.name,
    title: field.name,
  };
  return field.multiline ? <textarea {...common} className={`${common.className} resize-none py-0.5`} /> : <input {...common} />;
}

function SelectedPanel({
  item,
  font,
  inputRef,
  onChange,
  onDelete,
}: {
  item: OverlayItem;
  font: PDFFont | null;
  inputRef: React.MutableRefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  onChange: (patch: Partial<OverlayItem>) => void;
  onDelete: () => void;
}) {
  const bad = font && item.kind !== "signature" ? unsupportedChars(font, item.text) : [];
  const field = "w-full bg-white border border-line rounded-xl px-3 py-2 outline-none focus:border-ink";

  const colorPicker = (value: TextColor) => (
    <div className="flex gap-2">
      {(Object.keys(textColors) as TextColor[]).map((c) => (
        <button
          key={c}
          onClick={() => onChange({ color: c })}
          className={`w-7 h-7 rounded-full border-2 ${value === c ? "border-ink" : "border-transparent"}`}
          style={{ background: textColors[c].css }}
          aria-label={c}
        />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-[14.5px]">
          {item.kind === "text" ? "Text box" : item.kind === "signature" ? "Visual signature" : "Replacement text"}
        </div>
        <button onClick={onDelete} className="text-red-600 hover:text-red-700 flex items-center gap-1 text-[13px]">
          <Trash2 size={14} /> Delete
        </button>
      </div>

      {item.kind === "text" && (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Text</span>
            <textarea
              ref={(el) => {
                inputRef.current = el;
              }}
              value={item.text}
              onChange={(e) => onChange({ text: e.target.value })}
              rows={5}
              placeholder="Type here"
              className={`${field} resize-y`}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Size: {item.fontSize} pt</span>
            <input
              type="range"
              min={6}
              max={36}
              step={0.5}
              value={item.fontSize}
              onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
              className="accent-black"
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="font-medium">Colour</span>
            {colorPicker(item.color)}
          </div>
          <p className="text-[12.5px] text-muted">Drag the corner handle to change the box width; lines wrap to fit.</p>
        </>
      )}

      {item.kind === "replace" && (
        <>
          <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 px-3.5 py-3 text-[12.5px] leading-snug">
            <div className="font-semibold flex items-center gap-1.5 mb-1">
              <AlertTriangle size={13} /> Visual replacement only
            </div>
            An opaque box is drawn over the original words and your text is written on top. The original text is still
            inside the PDF and can be found by search, copied, or extracted. Don’t use this to remove confidential or
            privileged information; that needs true redaction.
          </div>
          <div>
            <div className="font-medium mb-1">Original</div>
            <div className="text-muted bg-card-alt rounded-lg px-3 py-2 break-words">{item.originalText}</div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Replace with</span>
            <input
              ref={(el) => {
                inputRef.current = el;
              }}
              value={item.text}
              onChange={(e) => onChange({ text: e.target.value })}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Size: {item.fontSize} pt</span>
            <input
              type="range"
              min={4}
              max={36}
              step={0.1}
              value={item.fontSize}
              onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
              className="accent-black"
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="font-medium">Text colour</span>
            {colorPicker(item.color)}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">Cover colour</span>
            <span
              className="w-6 h-6 rounded border border-line"
              style={{ background: `rgb(${item.cover.map((c) => Math.round(c * 255)).join(",")})` }}
            />
            <button onClick={() => onChange({ cover: [1, 1, 1] })} className="text-[12.5px] underline underline-offset-2 text-muted hover:text-ink">
              Use white
            </button>
          </div>
          <p className="text-[12.5px] text-muted">
            The correction uses Helvetica, so it may not exactly match the document’s font. Widen the box if the new
            text is longer than the original.
          </p>
        </>
      )}

      {item.kind === "signature" && (
        <>
          <div className="rounded-xl bg-card-alt px-3.5 py-3 text-[12.5px] leading-snug">
            This is an image of a signature placed on the page. It is not a certified or cryptographic digital
            signature and doesn’t prove who signed or lock the document against changes.
          </div>
          <p className="text-[12.5px] text-muted">Drag to move. Drag the corner handle to resize; the shape stays the same.</p>
        </>
      )}

      {bad.length > 0 && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 text-[12.5px]">
          These characters can’t be written with the standard PDF font and must be removed before saving: {bad.join(" ")}
        </div>
      )}
    </div>
  );
}

function SaveDialog({
  nextVersion,
  baseVersion,
  replacements,
  signatures,
  charProblems,
  onClose,
  onSave,
}: {
  nextVersion: number;
  baseVersion: number;
  replacements: number;
  signatures: number;
  charProblems: string[];
  onClose: () => void;
  onSave: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [ack, setAck] = useState(replacements === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await onSave(note);
    } catch (e) {
      setError(
        e instanceof ExportError || e instanceof UploadError
          ? e.message
          : "Saving failed. Your changes are still here; please try again."
      );
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={busy ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-cream rounded-3xl w-full max-w-[480px] p-7">
        <h2 className="text-[20px] font-semibold mb-1">Save as version {nextVersion}</h2>
        <p className="text-[13.5px] text-muted mb-4">
          A new PDF is added to this matter. Version {baseVersion} and every earlier version, including the original,
          stay exactly as they are.
        </p>
        <label className="flex flex-col gap-1.5 mb-4 text-[13.5px]">
          <span className="font-medium">Note (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Signed and dated page 3"
            className="bg-white border border-line rounded-xl px-3 py-2 outline-none focus:border-ink"
          />
        </label>
        {signatures > 0 && (
          <p className="text-[12.5px] text-muted mb-3">
            Includes {signatures} visual {signatures === 1 ? "signature" : "signatures"} (images, not certified digital
            signatures).
          </p>
        )}
        {replacements > 0 && (
          <label className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 px-3.5 py-3 mb-4 text-[12.5px] leading-snug cursor-pointer">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 accent-black" />
            <span>
              I understand the {replacements} text {replacements === 1 ? "replacement only covers" : "replacements only cover"} the
              original words visually. The original text is still in the file and can be searched, copied or extracted.
            </span>
          </label>
        )}
        {charProblems.length > 0 && (
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 mb-4 text-[12.5px]">
            Remove these characters first; the standard PDF font can’t write them: {charProblems.join(" ")}
          </div>
        )}
        {error && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 mb-4 text-[13px]">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="px-4 py-2 rounded-full text-[13.5px] font-medium text-muted hover:text-ink">
            Cancel
          </button>
          <button
            onClick={go}
            disabled={busy || !ack || charProblems.length > 0}
            className="bg-dark text-white px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 hover:bg-dark2 transition-colors disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
