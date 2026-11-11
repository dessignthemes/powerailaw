"use client";

import { useState } from "react";
import {
  Inbox as InboxIcon,
  Send,
  FileEdit,
  Trash2,
  ShieldAlert,
  Archive,
  Star,
  Bookmark,
  Folder,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  Loader2,
  FolderPlus,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import type { FolderKind, MailFolder } from "@/lib/mail/types";
import { sortFolders } from "@/lib/mail/folders";

function readOrder(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// Data type used when email rows are dragged onto a folder (see the Inbox list).
export const MAIL_DRAG_TYPE = "application/x-lawpower-mail";

const ICON: Record<FolderKind, typeof Folder> = {
  inbox: InboxIcon,
  drafts: FileEdit,
  sent: Send,
  trash: Trash2,
  junk: ShieldAlert,
  archive: Archive,
  starred: Star,
  important: Bookmark,
  custom: Folder,
};

export default function FolderPanel({
  folders,
  loading,
  error,
  onRetry,
  accountEmail,
  selectedId,
  favorites,
  onSelect,
  onToggleFavorite,
  onHide,
  onCreate,
  onDropEmails,
}: {
  folders: MailFolder[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  accountEmail: string | null;
  selectedId: string | null;
  favorites: string[];
  onSelect: (f: MailFolder) => void;
  onToggleFavorite: (f: MailFolder) => void;
  onHide: () => void;
  onCreate?: (name: string, parentId: string | null) => Promise<string | null>; // returns an error message, or null when it worked
  onDropEmails?: (folder: MailFolder, ids: string[]) => void;
}) {
  const [favOpen, setFavOpen] = useState(true);
  const [allOpen, setAllOpen] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // New folder: null = closed, "" = top level, otherwise the parent folder's id.
  const [creating, setCreating] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);

  const startCreate = (parentId: string) => {
    setCreating(parentId);
    setNewName("");
    setCreateError(null);
    if (parentId) setCollapsed((c) => { const n = new Set(c); n.delete(parentId); return n; });
  };
  const submitCreate = async () => {
    const name = newName.trim();
    if (!name || !onCreate || creating === null) return;
    setCreateBusy(true);
    const err = await onCreate(name, creating || null);
    setCreateBusy(false);
    if (err) setCreateError(err);
    else {
      setCreating(null);
      setNewName("");
    }
  };
  const newFolderBox = (depth: number) => (
    <div className="py-1" style={{ paddingLeft: 6 + depth * 14 + 20 }}>
      <div className="flex items-center gap-1.5 pr-1">
        <Folder size={14} strokeWidth={1.75} className="text-muted flex-shrink-0" />
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitCreate();
            if (e.key === "Escape") setCreating(null);
          }}
          disabled={createBusy}
          placeholder="Folder name"
          aria-label="New folder name"
          className="flex-1 min-w-0 bg-white border border-[#C0B599] rounded-lg px-2 py-1 text-[13px] outline-none focus:border-[#5E6E91] focus:ring-2 focus:ring-[#E7E2D7]"
        />
        {createBusy && <Loader2 size={13} className="animate-spin text-muted flex-shrink-0" />}
      </div>
      <div className="text-[11px] text-muted mt-1">{createError ?? "Enter to create · Esc to cancel"}</div>
    </div>
  );

  // Your own folder order (Move up / Move down), kept in this browser for this mailbox.
  const orderKey = `lp-folder-order:${accountEmail ?? "mail"}`;
  const [saved, setSaved] = useState<{ key: string; ids: string[] } | null>(null);
  const order = saved?.key === orderKey ? saved.ids : readOrder(orderKey);
  const setOrder = (ids: string[]) => setSaved({ key: orderKey, ids });
  const base = sortFolders(folders);
  const pos = new Map(order.map((id, i) => [id, i]));
  const sorted = base
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (pos.get(a.f.id) ?? 10000 + a.i) - (pos.get(b.f.id) ?? 10000 + b.i))
    .map((x) => x.f);
  const move = (f: MailFolder, dir: -1 | 1) => {
    const sibs = sorted.filter((x) => (x.parentId ?? null) === (f.parentId ?? null));
    const i = sibs.findIndex((x) => x.id === f.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sibs.length) return;
    const ids = sibs.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const next = [...ids, ...order.filter((id) => !ids.includes(id))];
    setOrder(next);
    try {
      localStorage.setItem(orderKey, JSON.stringify(next));
    } catch {}
  };
  const roots = sorted.filter((f) => !f.parentId);
  const childrenOf = (id: string) => sorted.filter((f) => f.parentId === id);
  const favs = favorites.map((id) => folders.find((f) => f.id === id)).filter((f): f is MailFolder => !!f);

  const row = (f: MailFolder, depth: number, inFavorites = false) => {
    const Icon = ICON[f.kind];
    const active = selectedId === f.id;
    const kids = inFavorites ? [] : childrenOf(f.id);
    const isFav = favorites.includes(f.id);
    const showCount = f.unread > 0 && f.kind !== "sent" && f.kind !== "trash";
    // Your own folders also show how many emails they hold, even when all are read.
    const showTotal = !showCount && f.kind === "custom" && (f.total ?? 0) > 0;
    const sibs = inFavorites ? [] : sorted.filter((x) => (x.parentId ?? null) === (f.parentId ?? null));
    const idx = sibs.findIndex((x) => x.id === f.id);
    return (
      <div key={`${inFavorites ? "fav" : "all"}-${f.id}`}>
        <div
          className={`group flex items-center gap-1.5 pr-2 rounded-lg transition-colors ${
            dropOn === `${inFavorites ? "fav" : "all"}-${f.id}` ? "bg-[#EFEDE6] ring-2 ring-[#C8BEA6]" : active ? "bg-[#F3F1EC]" : "hover:bg-[#F3F2F0]"
          }`}
          style={{ paddingLeft: 6 + depth * 14 }}
          onDragOver={(e) => {
            if (!onDropEmails || active || f.kind === "drafts" || f.kind === "sent" || !e.dataTransfer.types.includes(MAIL_DRAG_TYPE)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropOn(`${inFavorites ? "fav" : "all"}-${f.id}`);
          }}
          onDragLeave={() => setDropOn((d) => (d === `${inFavorites ? "fav" : "all"}-${f.id}` ? null : d))}
          onDrop={(e) => {
            setDropOn(null);
            const raw = e.dataTransfer.getData(MAIL_DRAG_TYPE);
            if (!raw || !onDropEmails) return;
            e.preventDefault();
            try {
              const ids = JSON.parse(raw) as string[];
              if (Array.isArray(ids) && ids.length) onDropEmails(f, ids);
            } catch {}
          }}
        >
          {kids.length > 0 ? (
            <button
              onClick={() =>
                setCollapsed((s) => {
                  const n = new Set(s);
                  if (n.has(f.id)) n.delete(f.id);
                  else n.add(f.id);
                  return n;
                })
              }
              className="w-4 h-4 flex items-center justify-center text-muted hover:text-ink flex-shrink-0"
              aria-label={collapsed.has(f.id) ? `Expand ${f.name}` : `Collapse ${f.name}`}
            >
              {collapsed.has(f.id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </button>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}
          <button onClick={() => onSelect(f)} className="flex-1 min-w-0 flex items-center gap-2 py-1.5 text-left">
            <Icon size={14} strokeWidth={1.75} className="text-muted flex-shrink-0" />
            <span className={`text-[13px] truncate ${active || showCount || showTotal ? "font-semibold" : ""}`}>{f.name}</span>
          </button>
          <button
            onClick={() => onToggleFavorite(f)}
            title={isFav ? "Remove from Favorites" : "Add to Favorites"}
            aria-label={isFav ? `Remove ${f.name} from Favorites` : `Add ${f.name} to Favorites`}
            className={`flex-shrink-0 transition-opacity ${isFav ? "text-[#C58B13] opacity-0 group-hover:opacity-100" : "text-muted opacity-0 group-hover:opacity-100 hover:text-ink"}`}
          >
            <Star size={12} fill={isFav ? "currentColor" : "none"} />
          </button>
          {onCreate && !inFavorites && depth === 0 && (
            <button
              onClick={() => startCreate(f.id)}
              title={`New folder inside ${f.name}`}
              aria-label={`New folder inside ${f.name}`}
              className="flex-shrink-0 text-muted opacity-0 group-hover:opacity-100 hover:text-ink transition-opacity"
            >
              <FolderPlus size={12} />
            </button>
          )}
          {!inFavorites && sibs.length > 1 && (
            <span className="flex-shrink-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => move(f, -1)}
                disabled={idx <= 0}
                title="Move up"
                aria-label={`Move ${f.name} up`}
                className="w-4 h-4 flex items-center justify-center text-muted hover:text-ink disabled:opacity-30"
              >
                <ArrowUp size={11} />
              </button>
              <button
                onClick={() => move(f, 1)}
                disabled={idx >= sibs.length - 1}
                title="Move down"
                aria-label={`Move ${f.name} down`}
                className="w-4 h-4 flex items-center justify-center text-muted hover:text-ink disabled:opacity-30"
              >
                <ArrowDown size={11} />
              </button>
            </span>
          )}
          {showCount && <span className="text-[12px] font-semibold text-[#1F3A93] tabular-nums flex-shrink-0">{f.unread}</span>}
          {showTotal && (
            <span className="text-[12px] font-semibold text-ink tabular-nums flex-shrink-0" title={`${f.total} email${f.total === 1 ? "" : "s"}`}>
              {f.total}
            </span>
          )}
        </div>
        {!inFavorites && creating === f.id && newFolderBox(depth + 1)}
        {kids.length > 0 && !collapsed.has(f.id) && kids.map((k) => row(k, depth + 1))}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">Folders</span>
        <span className="flex-1" />
        {onCreate && (
          <button
            onClick={() => startCreate("")}
            title="New folder"
            aria-label="New folder"
            className="h-7 px-2.5 mr-1 rounded-full bg-chip hover:bg-btn border border-btn flex items-center gap-1 text-[12px] font-medium transition-colors"
          >
            <FolderPlus size={13} strokeWidth={1.75} /> New
          </button>
        )}
        <button onClick={onHide} title="Hide folders" aria-label="Hide folders" className="w-7 h-7 rounded-full hover:bg-chip flex items-center justify-center text-muted hover:text-ink">
          <PanelLeftClose size={15} strokeWidth={1.75} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {loading && folders.length === 0 ? (
          <div className="flex items-center gap-2 text-[12.5px] text-muted px-2 py-4">
            <Loader2 size={13} className="animate-spin" /> Loading folders…
          </div>
        ) : error && folders.length === 0 ? (
          <div className="px-2 py-4">
            <div className="text-[12.5px] text-muted mb-3">{error}</div>
            {onRetry && (
              <button
                onClick={onRetry}
                className="bg-chip hover:bg-btn border border-btn px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-colors"
              >
                Try again
              </button>
            )}
          </div>
        ) : (
          <>
            <button onClick={() => setFavOpen(!favOpen)} className="w-full flex items-center gap-1.5 px-1.5 py-1.5 text-[13px] font-semibold">
              {favOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Favorites
            </button>
            {favOpen &&
              (favs.length ? favs.map((f) => row(f, 0, true)) : <div className="text-[12px] text-muted px-7 py-1">Star a folder to add it here.</div>)}

            <button onClick={() => setAllOpen(!allOpen)} className="w-full flex items-center gap-1.5 px-1.5 py-1.5 mt-2 text-[13px] font-semibold min-w-0">
              {allOpen ? <ChevronDown size={13} className="flex-shrink-0" /> : <ChevronRight size={13} className="flex-shrink-0" />}
              <span className="truncate">{accountEmail ?? "Mailbox"}</span>
            </button>
            {allOpen && roots.map((f) => row(f, 0))}
            {creating === "" && newFolderBox(0)}
            {onDropEmails && <div className="text-[11px] text-muted px-2 pt-3">Tip: drag an email onto a folder to move it.</div>}
          </>
        )}
      </div>
    </div>
  );
}
