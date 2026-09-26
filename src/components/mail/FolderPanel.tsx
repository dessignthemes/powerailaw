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
} from "lucide-react";
import type { FolderKind, MailFolder } from "@/lib/mail/types";
import { sortFolders } from "@/lib/mail/folders";

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
  accountEmail,
  selectedId,
  favorites,
  onSelect,
  onToggleFavorite,
  onHide,
}: {
  folders: MailFolder[];
  loading: boolean;
  error: string | null;
  accountEmail: string | null;
  selectedId: string | null;
  favorites: string[];
  onSelect: (f: MailFolder) => void;
  onToggleFavorite: (f: MailFolder) => void;
  onHide: () => void;
}) {
  const [favOpen, setFavOpen] = useState(true);
  const [allOpen, setAllOpen] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const sorted = sortFolders(folders);
  const roots = sorted.filter((f) => !f.parentId);
  const childrenOf = (id: string) => sorted.filter((f) => f.parentId === id);
  const favs = favorites.map((id) => folders.find((f) => f.id === id)).filter((f): f is MailFolder => !!f);

  const row = (f: MailFolder, depth: number, inFavorites = false) => {
    const Icon = ICON[f.kind];
    const active = selectedId === f.id;
    const kids = inFavorites ? [] : childrenOf(f.id);
    const isFav = favorites.includes(f.id);
    const showCount = f.unread > 0 && f.kind !== "sent" && f.kind !== "trash";
    return (
      <div key={`${inFavorites ? "fav" : "all"}-${f.id}`}>
        <div
          className={`group flex items-center gap-1.5 pr-2 rounded-lg transition-colors ${active ? "bg-card-alt" : "hover:bg-card-alt/60"}`}
          style={{ paddingLeft: 6 + depth * 14 }}
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
            <span className={`text-[13px] truncate ${active || showCount ? "font-semibold" : ""}`}>{f.name}</span>
          </button>
          <button
            onClick={() => onToggleFavorite(f)}
            title={isFav ? "Remove from Favorites" : "Add to Favorites"}
            aria-label={isFav ? `Remove ${f.name} from Favorites` : `Add ${f.name} to Favorites`}
            className={`flex-shrink-0 transition-opacity ${isFav ? "text-[#C58B13] opacity-0 group-hover:opacity-100" : "text-muted opacity-0 group-hover:opacity-100 hover:text-ink"}`}
          >
            <Star size={12} fill={isFav ? "currentColor" : "none"} />
          </button>
          {showCount && <span className="text-[12px] font-semibold text-[#1F3A93] tabular-nums flex-shrink-0">{f.unread}</span>}
        </div>
        {kids.length > 0 && !collapsed.has(f.id) && kids.map((k) => row(k, depth + 1))}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">Folders</span>
        <button onClick={onHide} title="Hide folders" aria-label="Hide folders" className="w-7 h-7 rounded-full hover:bg-card-alt flex items-center justify-center text-muted hover:text-ink">
          <PanelLeftClose size={15} strokeWidth={1.75} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {loading && folders.length === 0 ? (
          <div className="flex items-center gap-2 text-[12.5px] text-muted px-2 py-4">
            <Loader2 size={13} className="animate-spin" /> Loading folders…
          </div>
        ) : error ? (
          <div className="text-[12.5px] text-muted px-2 py-4">{error}</div>
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
          </>
        )}
      </div>
    </div>
  );
}
