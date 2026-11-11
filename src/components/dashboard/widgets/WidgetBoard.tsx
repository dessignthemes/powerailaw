"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Minus, X, Search, Plus, Check, LayoutGrid } from "lucide-react";
import { WIDGETS, WIDGET, WidgetSizeContext } from "./library";
import { SIZE_SPAN, GRID_GAP, MIN_COL, MAX_COLS, SIZE_LABEL, type DashData, type LayoutItem, type WidgetDef, type WidgetSize } from "./types";

// The Dashboard's widgets. Normal view: just the widgets. Edit view
// (Customize): drag to move, pick a size under each one, − to remove,
// Add widget for the library.

// The little size icons (like the Frix picker): dot, bar, square, wide, big.
function SizeIcon({ size, on }: { size: WidgetSize; on: boolean }) {
  const c = on ? "bg-ink" : "bg-[#9AA3B2]";
  const dims: Record<WidgetSize, string> = { s: "w-[7px] h-[7px] rounded-full", m: "w-[16px] h-[7px] rounded-[2px]", l: "w-[13px] h-[13px] rounded-[3px]", w: "w-[22px] h-[7px] rounded-[2px]", xl: "w-[20px] h-[13px] rounded-[3px]" };
  return <span className={`${dims[size]} ${c} block`} />;
}
export function SizePicker({ sizes, value, onPick, dark = false }: { sizes: WidgetSize[]; value: WidgetSize; onPick: (s: WidgetSize) => void; dark?: boolean }) {
  if (sizes.length < 2) return dark ? null : <span className="text-[12.5px] text-muted">{SIZE_LABEL[sizes[0]]}</span>;
  return (
    <div className={`inline-flex items-center gap-0.5 rounded-full p-1 ${dark ? "bg-[#1B191A]/85 " : "bg-card-alt"}`}>
      {sizes.map((s) => (
        <button
          key={s}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => (e.stopPropagation(), onPick(s))}
          title={SIZE_LABEL[s]}
          aria-label={SIZE_LABEL[s]}
          aria-pressed={value === s}
          className={`h-7 min-w-[34px] px-2 rounded-full flex items-center justify-center transition-colors ${value === s ? (dark ? "bg-white" : "bg-white ") : dark ? "hover:bg-white/15" : "hover:bg-white/70"}`}
        >
          <SizeIcon size={s} on={value === s || !dark} />
        </button>
      ))}
    </div>
  );
}

// The widget look: a soft tinted frame with a small mono, letter-spaced title
// (and an optional link on the right), around a white panel with the content.
export function WidgetShell({ def, size, d }: { def: WidgetDef; size: WidgetSize; d: DashData }) {
  const Icon = def.icon;
  const small = size === "s";
  return (
    <WidgetSizeContext.Provider value={size}>
      <div className={`h-full ${def.tone ?? "bg-[#F3F2F0]"} rounded-[22px] border border-[#E8E6E2] p-1.5 flex flex-col overflow-hidden relative transition-shadow duration-200`}>
        {!def.plain && (
          <div className={`flex items-center justify-between gap-2 ${small ? "px-2.5 pt-2 pb-2" : "px-3 pt-2.5 pb-2.5"}`}>
            <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted flex items-center gap-2 min-w-0">
              <Icon size={small ? 14 : 15} strokeWidth={1.75} className="flex-shrink-0" />
              <span className="truncate">{def.title ? def.title(d) : def.name}</span>
            </div>
            {def.action && size !== "s" && <div className="flex-shrink-0">{def.action(d)}</div>}
          </div>
        )}
        <div className={`flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-[#E9E7E4] ${small ? "p-3.5" : "p-4"}`}>{def.body(d, size)}</div>
      </div>
    </WidgetSizeContext.Provider>
  );
}

export default function WidgetBoard({ layout, onChange, editing, d }: { layout: LayoutItem[]; onChange: (l: LayoutItem[]) => void; editing: boolean; d: DashData }) {
  // Fit as many square columns as the page allows (up to 5), filling the width.
  const gridRef = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState({ cols: 4, size: 260 });
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      const cols = Math.max(1, Math.min(MAX_COLS, Math.floor((w + GRID_GAP) / (MIN_COL + GRID_GAP))));
      const size = Math.floor((w - GRID_GAP * (cols - 1)) / cols);
      setGrid((g) => (g.cols === cols && g.size === size ? g : { cols, size }));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Dragging (Edit view) ──────────────────────────────────────────────────
  // Pick a widget up and it follows the pointer; the others slide out of the way
  // and a dashed outline shows where it will land. Saved when you let go.
  const saved = layout.filter((x) => WIDGET(x.id));
  const [order, setOrder] = useState<LayoutItem[] | null>(null); // live order while dragging
  const items = order ?? saved;
  const [drag, setDrag] = useState<{ id: string; w: number; h: number; dx: number; dy: number; x: number; y: number } | null>(null);
  const els = useRef(new Map<string, HTMLDivElement>());
  const rectsBefore = useRef<Map<string, DOMRect> | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const orderRef = useRef<LayoutItem[] | null>(null);
  const setLive = (o: LayoutItem[] | null) => {
    orderRef.current = o;
    setOrder(o);
  };

  // Smooth slide (FLIP): after the order changes, each widget glides from where it was.
  useLayoutEffect(() => {
    const before = rectsBefore.current;
    if (!before) return;
    rectsBefore.current = null;
    els.current.forEach((el, id) => {
      const a = before.get(id);
      if (!a) return;
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (!dx && !dy) return;
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "transform 220ms cubic-bezier(.2,.8,.2,1)";
        el.style.transform = "";
      });
    });
  }, [order]);

  // Where the pointer is decides the spot: over another widget → take its place.
  // After a move there's a short pause, and the same widget only counts again once
  // the pointer has left it, so nothing flips back and forth.
  const lastTarget = useRef<string | null>(null);
  const coolUntil = useRef(0);
  const lastMovePos = useRef({ x: -999, y: -999 });
  function reorderToward(x: number, y: number, id: string, now: number) {
    const cur = orderRef.current;
    if (!cur) return;
    let over: string | null = null;
    let overDragged = false;
    let lowest = 0;
    els.current.forEach((el, oid) => {
      const r = el.getBoundingClientRect();
      lowest = Math.max(lowest, r.bottom);
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        if (oid === id) overDragged = true;
        else over = oid;
      }
    });
    if (overDragged) {
      lastTarget.current = null;
      return;
    }
    const from = cur.findIndex((it) => it.id === id);
    // Below every widget → move to the end.
    let to = -1;
    let key: string | null = null;
    if (over) {
      to = cur.findIndex((it) => it.id === over);
      key = over;
    } else if (y > lowest) {
      to = cur.length - 1;
      key = "__end";
    }
    if (key === null) {
      lastTarget.current = null;
      return;
    }
    if (key === lastTarget.current || from < 0 || to < 0 || from === to) return;
    if (now < coolUntil.current) return;
    // The pointer has to have moved since the last swap (stops chain reactions when widgets reflow).
    if (Math.hypot(x - lastMovePos.current.x, y - lastMovePos.current.y) < 8) return;
    lastMovePos.current = { x, y };
    lastTarget.current = key;
    coolUntil.current = now + 230;
    const before = new Map<string, DOMRect>();
    els.current.forEach((el, k) => before.set(k, el.getBoundingClientRect()));
    rectsBefore.current = before;
    const next = [...cur];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    setLive(next);
  }

  function startDrag(e: React.PointerEvent, id: string) {
    if (!editing || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return; // − and the size picker
    const el = els.current.get(id);
    if (!el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    pointer.current = { x: e.clientX, y: e.clientY };
    setLive(saved);
    lastTarget.current = null;
    coolUntil.current = 0;
    lastMovePos.current = { x: -999, y: -999 };
    setDrag({ id, w: r.width, h: r.height, dx: e.clientX - r.left, dy: e.clientY - r.top, x: e.clientX, y: e.clientY });
  }

  useEffect(() => {
    if (!drag) return;
    const id = drag.id;
    let raf = 0;
    const move = (ev: PointerEvent) => {
      pointer.current = { x: ev.clientX, y: ev.clientY };
      setDrag((g) => (g ? { ...g, x: ev.clientX, y: ev.clientY } : g));
      reorderToward(ev.clientX, ev.clientY, id, ev.timeStamp);
    };
    // Scroll the page when dragging near the top or bottom edge.
    const tick = () => {
      const { y } = pointer.current;
      const edge = 90;
      const vh = window.innerHeight;
      const speed = y < edge ? -Math.ceil((edge - y) / 6) : y > vh - edge ? Math.ceil((y - (vh - edge)) / 6) : 0;
      if (speed) {
        const scroller = gridRef.current?.closest("main")?.parentElement;
        window.scrollBy(0, speed);
        if (scroller && scroller.scrollHeight > scroller.clientHeight) scroller.scrollTop += speed;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const up = () => {
      const final = orderRef.current;
      setDrag(null);
      setLive(null);
      if (final && final.map((x) => x.id).join() !== saved.map((x) => x.id).join()) onChange(final);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    document.body.classList.add("lp-dragging");
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.classList.remove("lp-dragging");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per drag
  }, [drag?.id]);

  const dragDef = drag ? WIDGET(drag.id) : null;
  const dragItem = drag ? items.find((x) => x.id === drag.id) : null;

  return (
    <>
      <div ref={gridRef} className="grid" style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`, gridAutoRows: `${grid.size}px`, gap: GRID_GAP }}>
        {items.map((it) => {
          const def = WIDGET(it.id)!;
          const size = def.sizes.includes(it.size) ? it.size : def.size;
          const isDragged = drag?.id === it.id;
          return (
            <div
              key={it.id}
              ref={(el) => {
                if (el) els.current.set(it.id, el);
                else els.current.delete(it.id);
              }}
              style={{ gridColumn: `span ${Math.min(SIZE_SPAN[size][0], grid.cols)}`, gridRow: `span ${SIZE_SPAN[size][1]}`, touchAction: editing ? "none" : undefined }}
              className={`relative min-w-0 ${editing ? (drag ? "cursor-grabbing" : "cursor-grab") : ""}`}
              onPointerDown={(e) => startDrag(e, it.id)}
            >
              {isDragged ? (
                // Where it will land.
                <div className="h-full rounded-[22px] border border-dashed border-btn bg-[#F3F2F0] " />
              ) : (
                <div className={`h-full ${editing ? "pointer-events-none select-none rounded-[22px] ring-1 ring-line " : ""} ${editing && !drag ? "animate-[lpWiggle_0.35s_ease-in-out]" : ""}`}>
                  <WidgetShell def={def} size={size} d={d} />
                </div>
              )}
              {editing && !isDragged && (
                <>
                  <button
                    onClick={() => onChange(saved.filter((x) => x.id !== it.id))}
                    aria-label={`Remove ${def.name}`}
                    title="Remove from the Dashboard"
                    className="absolute -top-2.5 -left-2.5 z-10 w-7 h-7 rounded-full bg-ink text-white flex items-center justify-center hover:scale-105 transition-transform"
                  >
                    <Minus size={14} strokeWidth={2.5} />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
                    <SizePicker dark sizes={def.sizes} value={size} onPick={(s) => onChange(saved.map((x) => (x.id === it.id ? { ...x, size: s } : x)))} />
                  </div>
                </>
              )}
            </div>
          );
        })}
        {editing && !items.length && (
          <div className="col-span-full row-span-1 rounded-2xl border-2 border-dashed border-line flex flex-col items-center justify-center text-center text-muted">
            <LayoutGrid size={22} className="mb-2" />
            <div className="text-[14px] font-medium text-ink">No widgets yet</div>
            <div className="text-[13px]">Click Add widget to pick some.</div>
          </div>
        )}
      </div>

      {/* The widget in your hand, following the pointer. */}
      {drag && dragDef && dragItem &&
        createPortal(
          <div
            style={{ position: "fixed", left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.w, height: drag.h, zIndex: 80, pointerEvents: "none" }}
            className="rotate-[1.2deg] scale-[1.03] rounded-[22px] transition-transform"
          >
            <WidgetShell def={dragDef} size={dragDef.sizes.includes(dragItem.size) ? dragItem.size : dragDef.size} d={d} />
          </div>,
          document.body,
        )}
    </>
  );
}

// ── Add widget: the library ──────────────────────────────────────────────────
const CATS = ["Tasks", "Calendar", "Matters", "Clients and intake", "Firm", "AI and tools"] as const;
const PREVIEW: Record<WidgetSize, [number, number]> = { s: [275, 275], m: [570, 275], l: [570, 571], w: [1160, 275], xl: [1160, 571] };

function Preview({ def, size, d }: { def: WidgetDef; size: WidgetSize; d: DashData }) {
  const [w, h] = PREVIEW[size];
  const box = { w: 210, h: 160 };
  const k = Math.min(box.w / w, box.h / h, 0.75);
  return (
    <div className="h-[200px] bg-[#F1F0EE] flex items-center justify-center overflow-hidden" aria-hidden>
      <div style={{ width: w * k, height: h * k }} className="relative">
        <div style={{ width: w, height: h, transform: `scale(${k})`, transformOrigin: "top left" }} className="absolute left-0 top-0 pointer-events-none rounded-[22px]">
          <WidgetShell def={def} size={size} d={d} />
        </div>
      </div>
    </div>
  );
}

export function AddWidgetModal({ layout, onAdd, onRemove, onClose, d }: { layout: LayoutItem[]; onAdd: (id: string, size: WidgetSize) => void; onRemove: (id: string) => void; onClose: () => void; d: DashData }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [sizes, setSizes] = useState<Record<string, WidgetSize>>({});
  const onHome = new Set(layout.map((x) => x.id));
  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return WIDGETS.filter((w) => (cat === "all" || w.category === cat) && words.every((x) => `${w.name} ${w.desc} ${w.category}`.toLowerCase().includes(x)));
  }, [q, cat]);
  return (
    <div className="fixed inset-0 z-[60] bg-black/25 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Widgets" className="bg-cream rounded-3xl w-full max-w-[1180px] h-full max-h-[90vh] flex overflow-hidden ">
        <aside className="w-[250px] flex-shrink-0 border-r border-line p-5 hidden md:flex flex-col gap-1">
          <h2 className="text-[22px] font-semibold mb-3">Widgets</h2>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search widgets" className="w-full bg-white border border-line rounded-xl pl-8 pr-3 py-2 text-[13.5px] outline-none focus:border-btn-ring" />
          </div>
          {[["all", "All widgets", WIDGETS.length] as const, ...CATS.map((c) => [c, c, WIDGETS.filter((w) => w.category === c).length] as const)].map(([key, label, n]) => (
            <button key={key} onClick={() => setCat(key)} className={`flex items-center justify-between px-3 py-2 rounded-xl text-[14px] font-medium ${cat === key ? "bg-chip" : "hover:bg-chip/60 text-muted hover:text-ink"}`}>
              {label}
              <span className="text-[12.5px] text-muted tabular-nums">{n}</span>
            </button>
          ))}
        </aside>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-start justify-between px-7 pt-6 pb-4">
            <div>
              <h3 className="text-[22px] font-semibold">{cat === "all" ? "All widgets" : cat}</h3>
              <p className="text-[13.5px] text-muted">Pick a size, then add. Widgets show your firm&apos;s real numbers.</p>
            </div>
            <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-chip flex items-center justify-center">
              <X size={17} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-7 pb-7">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {list.map((w) => {
                const size = sizes[w.id] ?? w.size;
                const added = onHome.has(w.id);
                return (
                  <div key={w.id} className="bg-white border border-line rounded-2xl overflow-hidden flex flex-col">
                    <Preview def={w} size={size} d={d} />
                    <div className="p-4 flex flex-col gap-2 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-semibold">{w.name}</span>
                        {added && <span className="text-[11px] font-medium bg-chip rounded-full px-2 py-0.5">On Dashboard</span>}
                      </div>
                      <p className="text-[12.5px] text-muted flex-1">{w.desc}</p>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <SizePicker sizes={w.sizes} value={size} onPick={(s) => setSizes((x) => ({ ...x, [w.id]: s }))} />
                        {added ? (
                          <button onClick={() => onRemove(w.id)} className="flex items-center gap-1 px-3.5 py-1.5 rounded-full text-[13px] font-medium bg-chip hover:bg-btn">
                            <Check size={13} /> Remove
                          </button>
                        ) : (
                          <button onClick={() => onAdd(w.id, size)} className="flex items-center gap-1 px-3.5 py-1.5 rounded-full text-[13px] font-semibold bg-btn hover:bg-btn-hover">
                            <Plus size={13} /> Add
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {!list.length && <div className="text-center text-muted py-16 text-[14px]">No widgets match &ldquo;{q}&rdquo;.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
