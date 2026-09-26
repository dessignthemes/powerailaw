"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BarChart3, ChevronDown, ChevronRight, Plus, Hash, Loader2 } from "lucide-react";
import { useWorkspaceData } from "@/context/WorkspaceDataContext";

const OPEN_KEY = "lawpower.sidebar.taskBoardsOpen";

function readOpen() {
  try {
    return typeof window === "undefined" ? true : window.localStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

// "Task Board" in the sidebar, with its sub boards underneath.
export default function TaskBoardNav() {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const { boards, createBoard } = useWorkspaceData();
  const [open, setOpen] = useState(readOpen);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onBoardPage = pathname === "/dashboard/task-board";
  const current = onBoardPage ? search.get("board") : undefined;

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      // not persisted
    }
  }

  async function add() {
    if (!name.trim()) return setAdding(false);
    setBusy(true);
    setError(null);
    try {
      const b = await createBoard(name);
      setName("");
      setAdding(false);
      setOpen(true);
      router.push(`/dashboard/task-board?board=${b.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const item = (active: boolean) =>
    `flex items-center gap-2.5 rounded-lg text-[14px] font-medium transition-colors ${active ? "bg-card-alt text-ink" : "text-muted hover:bg-card-alt hover:text-ink"}`;

  return (
    <div>
      <div className={`${item(onBoardPage && !current)} pr-1`}>
        <Link href="/dashboard/task-board" className="flex-1 flex items-center gap-2.5 px-3 py-2 min-w-0">
          <BarChart3 size={16} strokeWidth={1.75} className="flex-shrink-0" />
          Task Board
        </Link>
        <button
          onClick={toggle}
          className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-ink hover:bg-line/50"
          aria-label={open ? "Collapse sub boards" : "Expand sub boards"}
          aria-expanded={open}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      {open && (
        <div className="ml-[22px] pl-2 border-l border-line mt-0.5 mb-1 flex flex-col gap-0.5">
          {boards.map((b) => (
            <Link key={b.id} href={`/dashboard/task-board?board=${b.id}`} className={`${item(current === b.id)} px-2.5 py-1.5 text-[13.5px]`} title={b.name}>
              <Hash size={13} strokeWidth={1.75} className="flex-shrink-0" />
              <span className="truncate">{b.name}</span>
            </Link>
          ))}
          {adding ? (
            <div className="px-1 py-0.5">
              <input
                autoFocus
                value={name}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") add();
                  if (e.key === "Escape") {
                    setAdding(false);
                    setName("");
                    setError(null);
                  }
                }}
                onBlur={() => !busy && !name.trim() && setAdding(false)}
                placeholder="Board name"
                maxLength={80}
                className="w-full bg-white border border-line rounded-md px-2 py-1 text-[13px] outline-none focus:border-ink"
              />
              {busy && (
                <div className="flex items-center gap-1 text-[11.5px] text-muted mt-1">
                  <Loader2 size={11} className="animate-spin" /> Creating…
                </div>
              )}
              {error && <div className="text-[11.5px] text-red-600 mt-1">{error}</div>}
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className={`${item(false)} px-2.5 py-1.5 text-[13px]`}>
              <Plus size={13} strokeWidth={1.75} /> New board
            </button>
          )}
        </div>
      )}
    </div>
  );
}
