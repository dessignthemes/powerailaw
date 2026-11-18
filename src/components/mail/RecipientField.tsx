"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

// To / Cc / Bcc with the matter's people to pick from: click the box and the
// list opens (people on this matter first, then the firm's staff). Click a
// person to add them (click again to take them off); the list stays open so
// several can be picked, and closes on a click outside it, Escape or Tab.
// Typing still works: addresses separated by commas.

export type Recipient = { name: string; email: string; role: string };

const parts = (v: string) => v.split(/[,;]/).map((x) => x.trim()).filter(Boolean);

export default function RecipientField({
  label,
  value,
  onChange,
  people,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  people: { matter: Recipient[]; staff: Recipient[] } | null;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const chosen = parts(value).map((x) => (x.match(/<([^>]+)>/)?.[1] ?? x).toLowerCase());
  // What's being typed after the last comma narrows the list.
  const typing = value.endsWith(",") || value.endsWith(", ") ? "" : (value.split(/[,;]/).pop() ?? "").trim().toLowerCase();
  const fits = (p: Recipient) => !typing || `${p.name} ${p.email} ${p.role}`.toLowerCase().includes(typing) || chosen.includes(p.email);
  const has = (p: Recipient) => chosen.includes(p.email);

  function pick(p: Recipient) {
    const list = parts(value);
    if (has(p)) {
      onChange(list.filter((x) => (x.match(/<([^>]+)>/)?.[1] ?? x).toLowerCase() !== p.email).join(", ") + (list.length > 1 ? ", " : ""));
    } else {
      // Replace the half-typed part with the person's address.
      const last = list[list.length - 1] ?? "";
      const half = !!typing && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(last);
      const kept = half ? list.slice(0, -1) : list;
      onChange([...kept, p.email].join(", ") + ", ");
    }
  }

  const groups = people
    ? ([
        ["On this matter", people.matter.filter(fits)],
        ["Firm staff", people.staff.filter(fits)],
      ] as const).filter(([, l]) => l.length)
    : [];

  return (
    <div ref={box} className="relative">
      <label className="flex items-center gap-2">
        <span className="text-[12.5px] font-semibold text-muted w-9 flex-shrink-0">{label}</span>
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => (e.key === "Escape" || e.key === "Tab") && setOpen(false)}
          placeholder={placeholder ?? "Pick from the list, or type an address"}
          autoComplete="off"
          className="flex-1 min-w-0 bg-white border border-line rounded-xl px-3 py-2 text-[14px] outline-none"
        />
      </label>
      {open && groups.length > 0 && (
        <div className="absolute left-11 right-0 top-full mt-1 z-30 bg-white rounded-xl border border-[#E8E6E2] p-1.5 max-h-[300px] overflow-y-auto">
          <div className="flex items-center gap-2 px-2.5 pb-1 text-[11px] text-muted">
            <span className="flex-1">Click everyone to add (click again to remove)</span>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(false)} className="text-[11.5px] font-semibold text-ink px-2 py-0.5 rounded-full bg-[#F3F2F0] hover:bg-[#E7E5E1]">
              Done
            </button>
          </div>
          {groups.map(([title, list]) => (
            <div key={title}>
              <div className="px-2.5 pt-1.5 pb-1 font-mono text-[10.5px] uppercase tracking-wider text-muted">{title}</div>
              {list.map((p) => (
                <button
                  key={`${title}-${p.email}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(p)}
                  className={`w-full flex items-center gap-2.5 text-left px-2.5 py-1.5 rounded-lg ${has(p) ? "bg-[#E8F6EE]" : "hover:bg-[#F3F2F0]"}`}
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${has(p) ? "bg-[#2F9E5A] border-[#2F9E5A] text-white" : "border-[#C9C6BF]"}`}>{has(p) && <Check size={10} strokeWidth={3} />}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] font-medium truncate">
                      {p.name} <span className="text-muted font-normal">({p.role})</span>
                    </span>
                    <span className="block text-[12px] text-muted truncate">{p.email}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
