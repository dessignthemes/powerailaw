"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Hourglass, Flag, UserRound, CircleSlash, CalendarX } from "lucide-react";
import type { CustomFilter } from "@/lib/tasks/customFilters";

const SUGGESTED_PARTIES = ["Client", "Lender", "Title company", "Seller", "Buyer", "Opposing counsel", "Court"];

// "+ Add more" on the Task Board: a board's own quick filters.
export default function AddFilterMenu({
  existing,
  members,
  onAdd,
  onClose,
}: {
  existing: CustomFilter[];
  members: { email: string; fullName?: string | null }[];
  onAdd: (f: Omit<CustomFilter, "id">) => void;
  onClose: () => void;
}) {
  const [party, setParty] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const has = (kind: CustomFilter["kind"], value?: string) =>
    existing.some((f) => f.kind === kind && (f.value ?? "").toLowerCase() === (value ?? "").toLowerCase());

  useEffect(() => {
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // (next tick, so the click that opened the menu doesn't close it)
    const t = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const chip = "px-2.5 py-1 rounded-full text-[12.5px] font-medium bg-chip hover:bg-btn transition-colors disabled:opacity-40 disabled:hover:bg-chip";
  const head = "flex items-center gap-1.5 text-[12px] font-semibold text-muted mb-1.5";
  const typed = party.trim();

  return (
    <div
      ref={box}
      role="dialog"
      aria-label="Add a filter"
      className="absolute left-0 top-[calc(100%+6px)] z-50 w-[340px] max-w-[calc(100vw-32px)] bg-white border border-line rounded-2xl shadow-[0_20px_50px_-15px_rgba(18,17,16,0.25)] p-3.5 flex flex-col gap-3.5"
    >
      <div className="text-[13px] text-muted">Add a quick filter to this board. Everyone in your firm sees it.</div>

      <div>
        <div className={head}>
          <Hourglass size={12} /> Waiting on…
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {SUGGESTED_PARTIES.filter((p) => !has("waiting", p)).map((p) => (
            <button key={p} onClick={() => onAdd({ kind: "waiting", value: p })} className={chip}>
              {p}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (typed && !has("waiting", typed)) onAdd({ kind: "waiting", value: typed });
          }}
          className="flex gap-1.5"
        >
          <input
            value={party}
            onChange={(e) => setParty(e.target.value.slice(0, 60))}
            placeholder="Someone else, e.g. Surveyor"
            aria-label="Waiting on whom"
            className="flex-1 min-w-0 bg-white border border-line rounded-full px-3 py-1.5 text-[13px] outline-none focus:border-[#AEB8C6]"
          />
          <button type="submit" disabled={!typed || has("waiting", typed)} className="flex items-center gap-1 bg-btn hover:bg-btn-hover disabled:opacity-40 px-3 py-1.5 rounded-full text-[12.5px] font-medium">
            <Plus size={12} /> Add
          </button>
        </form>
      </div>

      <div>
        <div className={head}>
          <Flag size={12} /> Priority
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["High", "Medium", "Low"].map((p) => (
            <button key={p} disabled={has("priority", p)} onClick={() => onAdd({ kind: "priority", value: p })} className={chip}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {members.length > 0 && (
        <div>
          <div className={head}>
            <UserRound size={12} /> Assigned to
          </div>
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => (
              <button key={m.email} disabled={has("assignee", m.email)} onClick={() => onAdd({ kind: "assignee", value: m.email })} className={chip}>
                {m.fullName || m.email}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <button disabled={has("unassigned")} onClick={() => onAdd({ kind: "unassigned" })} className={`${chip} flex items-center gap-1`}>
          <CircleSlash size={12} /> Unassigned
        </button>
        <button disabled={has("nodue")} onClick={() => onAdd({ kind: "nodue" })} className={`${chip} flex items-center gap-1`}>
          <CalendarX size={12} /> No due date
        </button>
      </div>
    </div>
  );
}
