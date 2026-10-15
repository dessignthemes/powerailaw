"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, User, Users } from "lucide-react";
import { displayName } from "@/lib/initials";

// Pick one person (assigned straight away) or several (offered: the first to accept takes it).
export default function AssigneeMultiPicker({
  members,
  value,
  onChange,
  variant = "field",
}: {
  members: { id: string; email: string; fullName?: string | null }[];
  value: string[];
  onChange: (emails: string[]) => void;
  // "field": white input (forms); "pill": blue-grey button like Templates (task window).
  variant?: "field" | "pill";
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const nameOf = (email: string) => {
    const m = members.find((x) => x.email.toLowerCase() === email.toLowerCase());
    return m ? displayName(m.fullName, m.email) : email;
  };
  const label = value.length === 0 ? "Unassigned" : value.length === 1 ? nameOf(value[0]) : `Offer to ${value.length} people`;
  const toggle = (email: string) => onChange(value.includes(email) ? value.filter((e) => e !== email) : [...value, email]);

  return (
    <div className={variant === "pill" ? "relative inline-block" : "relative"} ref={box}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={
          variant === "pill"
            ? "flex items-center gap-1.5 bg-btn hover:bg-btn-hover transition-colors px-3.5 py-1.5 rounded-full text-[13.5px] font-medium max-w-[360px]"
            : "w-full flex items-center justify-between gap-2 bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] text-left focus:border-ink outline-none"
        }
      >
        <span className={`flex items-center gap-2 truncate ${value.length || variant === "pill" ? "" : "text-muted"}`}>
          {variant === "pill" ? <User size={13} strokeWidth={1.75} className="flex-shrink-0" /> : value.length > 1 && <Users size={14} className="flex-shrink-0" />}
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown size={variant === "pill" ? 13 : 15} className={`flex-shrink-0 ${variant === "pill" ? "" : "text-muted"}`} />
      </button>
      {value.length > 1 && (
        <div className="text-[11.5px] text-muted mt-1">Offered to {value.map(nameOf).join(", ")}. The first to accept takes it.</div>
      )}
      {open && (
        <div role="listbox" aria-multiselectable className={`absolute left-0 ${variant === "pill" ? "w-[300px]" : "right-0"} top-[calc(100%+6px)] z-50 bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-1.5 flex flex-col gap-[3px] max-h-[min(420px,60vh)] overflow-y-auto`}>
          <div className="px-3 pt-1 pb-1.5 text-[11.5px] text-muted">Tick one person, or several to offer it: the first to accept takes it.</div>
          {members.map((m) => {
            const on = value.includes(m.email);
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => toggle(m.email)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[14px] text-left ${on ? "bg-chip" : "hover:bg-chip"}`}
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${on ? "bg-ink border-ink text-white" : "border-line bg-white"}`}>
                  {on && <Check size={11} strokeWidth={3} />}
                </span>
                <span className="truncate">{displayName(m.fullName, m.email)}</span>
              </button>
            );
          })}
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="px-3 py-1.5 text-[12.5px] text-muted hover:text-ink text-left">
              Clear (unassigned)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
