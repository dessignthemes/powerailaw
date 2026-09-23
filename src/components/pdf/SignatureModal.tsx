"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Eraser, Upload } from "lucide-react";

export type CapturedSignature = { pngDataUrl: string; aspect: number };

type Mode = "draw" | "type" | "upload";

const typeFaces = [
  { label: "Script", css: '"Snell Roundhand", "Segoe Script", "Brush Script MT", "Apple Chancery", cursive' },
  { label: "Handwritten", css: '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive' },
  { label: "Formal", css: '"Baskerville", "Georgia", "Times New Roman", serif' },
];

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

// Crop a canvas to its non-transparent pixels (with a little padding) and
// return a PNG, so the placed signature box hugs the ink.
function trimToPng(canvas: HTMLCanvasElement): CapturedSignature | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 6;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")!.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
  return { pngDataUrl: out.toDataURL("image/png"), aspect: w / h };
}

export default function SignatureModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (sig: CapturedSignature) => void;
}) {
  const [mode, setMode] = useState<Mode>("draw");
  const [error, setError] = useState<string | null>(null);

  // Draw
  const drawCanvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  // Type
  const [typed, setTyped] = useState("");
  const [face, setFace] = useState(0);

  // Upload
  const [uploaded, setUploaded] = useState<CapturedSignature | null>(null);

  useEffect(() => {
    const c = drawCanvas.current;
    if (!c || mode !== "draw") return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111111";
  }, [mode]);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function clearDrawing() {
    const c = drawCanvas.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  }

  function renderTyped(): CapturedSignature | null {
    if (!typed.trim()) return null;
    const c = document.createElement("canvas");
    c.width = 1400;
    c.height = 360;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#111111";
    ctx.textBaseline = "middle";
    ctx.font = `120px ${typeFaces[face].css}`;
    ctx.fillText(typed.trim(), 40, 180, 1320);
    return trimToPng(c);
  }

  function onUpload(file: File | undefined) {
    setError(null);
    setUploaded(null);
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Use a PNG, JPG or WebP image.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Signature images must be 2 MB or smaller.");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // Re-encode as PNG (and cap the size) so every signature embeds the same way.
      const scale = Math.min(1, 1200 / img.naturalWidth);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      setUploaded({ pngDataUrl: c.toDataURL("image/png"), aspect: c.width / c.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("That image couldn't be read. Try a different file.");
    };
    img.src = url;
  }

  function done() {
    let sig: CapturedSignature | null = null;
    if (mode === "draw" && drawCanvas.current) sig = trimToPng(drawCanvas.current);
    if (mode === "type") sig = renderTyped();
    if (mode === "upload") sig = uploaded;
    if (!sig) {
      setError(mode === "draw" ? "Draw your signature first." : mode === "type" ? "Type your name first." : "Choose an image first.");
      return;
    }
    onDone(sig);
  }

  const tabBtn = (m: Mode, label: string) => (
    <button
      onClick={() => {
        setMode(m);
        setError(null);
      }}
      className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
        mode === m ? "bg-dark text-white" : "bg-card-alt text-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-cream rounded-3xl w-full max-w-[600px]">
        <div className="flex items-start justify-between px-7 pt-6 pb-3">
          <div>
            <h2 className="text-[20px] font-semibold">Add a signature</h2>
            <p className="text-[13px] text-muted mt-0.5">
              This places a picture of your signature on the page. It is a visual signature, not a certified digital
              signature, and does not cryptographically seal the document.
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink ml-4 mt-1" aria-label="Close">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-7 flex gap-2 mb-4">
          {tabBtn("draw", "Draw")}
          {tabBtn("type", "Type")}
          {tabBtn("upload", "Upload image")}
        </div>

        <div className="px-7">
          {mode === "draw" && (
            <div>
              <canvas
                ref={drawCanvas}
                className="w-full h-[200px] bg-white border border-line rounded-2xl touch-none cursor-crosshair"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drawing.current = true;
                  last.current = point(e);
                }}
                onPointerMove={(e) => {
                  if (!drawing.current || !last.current) return;
                  const p = point(e);
                  const ctx = e.currentTarget.getContext("2d")!;
                  ctx.beginPath();
                  ctx.moveTo(last.current.x, last.current.y);
                  ctx.lineTo(p.x, p.y);
                  ctx.stroke();
                  last.current = p;
                  if (!hasInk) setHasInk(true);
                }}
                onPointerUp={() => {
                  drawing.current = false;
                  last.current = null;
                }}
              />
              <div className="flex items-center justify-between mt-2 text-[12.5px] text-muted">
                <span>Sign with your mouse, trackpad or finger.</span>
                <button onClick={clearDrawing} className="flex items-center gap-1 hover:text-ink">
                  <Eraser size={13} strokeWidth={1.75} /> Clear
                </button>
              </div>
            </div>
          )}

          {mode === "type" && (
            <div>
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Type your full name"
                className="w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none focus:border-ink mb-3"
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {typeFaces.map((f, i) => (
                  <button
                    key={f.label}
                    onClick={() => setFace(i)}
                    className={`h-[74px] bg-white rounded-xl border px-3 text-[26px] truncate transition-colors ${
                      face === i ? "border-ink" : "border-line hover:border-muted"
                    }`}
                    style={{ fontFamily: f.css }}
                    aria-label={`${f.label} style`}
                  >
                    {typed.trim() || "Your name"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === "upload" && (
            <div>
              <label className="flex flex-col items-center justify-center h-[200px] bg-white border border-dashed border-line rounded-2xl cursor-pointer hover:border-muted transition-colors">
                {uploaded ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={uploaded.pngDataUrl} alt="Uploaded signature" className="max-h-[150px] max-w-[90%] object-contain" />
                ) : (
                  <>
                    <Upload size={20} strokeWidth={1.5} className="text-muted mb-2" />
                    <span className="text-[13.5px] font-medium">Choose an image of your signature</span>
                    <span className="text-[12.5px] text-muted mt-0.5">PNG with a transparent background works best. Max 2 MB.</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => onUpload(e.target.files?.[0])}
                />
              </label>
            </div>
          )}

          {error && <div className="mt-3 text-[13px] text-red-600">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 px-7 py-5 mt-4 border-t border-line">
          <button onClick={onClose} className="px-4 py-2 rounded-full text-[13.5px] font-medium text-muted hover:text-ink">
            Cancel
          </button>
          <button
            onClick={done}
            className="bg-dark text-white px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors"
          >
            Place on page
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
