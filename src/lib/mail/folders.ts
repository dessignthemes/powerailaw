import type { FolderKind, MailFolder } from "@/lib/mail/types";

// Standard folders first, in the order Outlook shows them; then your own folders A–Z.
export const FOLDER_ORDER: FolderKind[] = ["inbox", "starred", "important", "drafts", "sent", "trash", "junk", "archive"];

export function sortFolders(folders: MailFolder[]) {
  const rank = (f: MailFolder) => (f.kind === "custom" ? 100 : FOLDER_ORDER.indexOf(f.kind));
  return [...folders].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
