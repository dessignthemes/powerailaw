"use client";

import { useMemo, useRef, useState } from "react";
import { Minus, X, Search, Plus, Check, LayoutGrid } from "lucide-react";
import { WIDGETS, WIDGET } from "./library";
import { SIZE_CLASS, SIZE_LABEL, type DashData, type LayoutItem, type WidgetDef, type WidgetSize } from "./types";

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
    <div className={`inline-flex items-center gap-0.5 rounded-full p-1 ${dark ? "bg-[#1B191A]/85 shadow-lg" : "bg-card-alt"}`}>
      {sizes.map((s) => (
        <button
          key={s}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => (e.stopPropagation(), onPick(s))}
          title={SIZE_LABEL[s]}
          aria-label={SIZE_LABEL[s]}
          aria-pressed={value === s}
          className={`h-7 min-w-[34px] px-2 rounded-full flex items-center justify-center transition-colors ${value === s ? (dark ? "bg-white" : "bg-white shadow-sm") : dark ? "hover:bg-white/15" : "hover:bg-white/70"}`}
        >
          <SizeIcon size={s} on={value === s || !dark} />
        </button>
      ))}
    </div>
  );
}

export function WidgetShell({ def, size, d }: { def: WidgetDef; size: WidgetSize; d: DashData }) {
  const Icon = def.icon;
  return (
    <div className={`h-full ${def.tone ?? "bg-card-alt"} rounded-2xl p-5 flex flex-col overflow-hidden relative`}>
      {!def.plain && (
        <div className="flex items-center justify-between gap-2 mb-3 min-h-[26px]">
          <div className="text-[13.5px] font-medium text-muted flex items-center gap-1.5 min-w-0">
            <Icon size={15} strokeWidth={1.75} className="flex-shrink-0" />
            <span className="truncate">{def.title ? def.title(d) : def.name}</span>
          </div>
          {def.action && size !== "s" && <div className="flex-shrink-0">{def.action(d)}</div>}
        </div>
      )}
      <div className="flex-1 min-h-0 flex flex-col">{def.body(d, size)}</div>
    </div>
  );
}

export default function WidgetBoard({ layout, onChange, editing, d }: { layout: LayoutItem[]; onChange: (l: LayoutItem[]) => void; editing: boolean; d: DashData }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const lastOver = useRef<string | null>(null);
  const items = layout.filter((x) => WIDGET(x.id));

  function moveTo(id: string, overId: string) {
    if (id === overId) return;
    const from = items.findIndex((x) => x.id === id);
    const to = items.findIndex((x) => x.id === overId);
    if (from < 0 || to < 0) return;
    const next = [...items];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    onChange(next);
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 auto-rows-[270px] gap-5 grid-flow-row-dense">
      {items.map((it) => {
        const def = WIDGET(it.id)!;
        const size = def.sizes.includes(it.size) ? it.size : def.size;
        return (
          <div
            key={it.id}
            className={`${SIZE_CLASS[size]} relative min-w-0 ${editing ? "cursor-grab active:cursor-grabbing" : ""} ${dragId === it.id ? "opacity-40" : ""}`}
            draggable={editing}
            onDragStart={(e) => {
              setDragId(it.id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", it.id);
            }}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              if (lastOver.current !== it.id) {
                lastOver.current = it.id;
                moveTo(dragId, it.id);
              }
            }}
            onDragEnd={() => {
              setDragId(null);
              lastOver.current = null;
            }}
            onDrop={(e) => e.preventDefault()}
          >
            <div className={`h-full ${editing ? "pointer-events-none select-none rounded-2xl ring-1 ring-line shadow-[0_8px_24px_-12px_rgba(27,25,26,0.25)] animate-[lpWiggle_0.35s_ease-in-out]" : ""}`}>
              <WidgetShell def={def} size={size} d={d} />
            </div>
            {editing && (
              <>
                <button
                  onClick={() => onChange(items.filter((x) => x.id !== it.id))}
                  aria-label={`Remove ${def.name}`}
                  title="Remove from the Dashboard"
                  className="absolute -top-2.5 -left-2.5 z-10 w-7 h-7 rounded-full bg-ink text-white flex items-center justify-center shadow hover:scale-105 transition-transform"
                >
                  <Minus size={14} strokeWidth={2.5} />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
                  <SizePicker dark sizes={def.sizes} value={size} onPick={(s) => onChange(items.map((x) => (x.id === it.id ? { ...x, size: s } : x)))} />
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
  );
}

// ── Add widget: the library ──────────────────────────────────────────────────
const CATS = ["Tasks", "Calendar", "Matters", "Clients and intake", "Firm", "AI and tools"] as const;
const PREVIEW: Record<WidgetSize, [number, number]> = { s: [210, 270], m: [440, 270], l: [440, 560], w: [900, 270], xl: [900, 560] };

function Preview({ def, size, d }: { def: WidgetDef; size: WidgetSize; d: DashData }) {
  const [w, h] = PREVIEW[size];
  const box = { w: 210, h: 160 };
  const k = Math.min(box.w / w, box.h / h, 0.75);
  return (
    <div className="h-[200px] bg-[#EEF1F6] flex items-center justify-center overflow-hidden" aria-hidden>
      <div style={{ width: w * k, height: h * k }} className="relative">
        <div style={{ width: w, height: h, transform: `scale(${k})`, transformOrigin: "top left" }} className="absolute left-0 top-0 pointer-events-none shadow-[0_10px_30px_-12px_rgba(27,25,26,0.3)] rounded-2xl">
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
      <div role="dialog" aria-label="Widgets" className="bg-cream rounded-3xl w-full max-w-[1180px] h-full max-h-[90vh] flex overflow-hidden shadow-[0_30px_80px_-20px_rgba(18,17,16,0.35)]">
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
