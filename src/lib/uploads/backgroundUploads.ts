"use client";

// Documents added in the background: the Add documents window hands the files
// over and closes, and they upload here while the user keeps working (moving
// between pages is fine; only closing or reloading the tab stops them).
import { uploadAnyDocument, UploadError } from "@/lib/pdf/upload";

export const DOCS_CHANGED_EVENT = "lp:documents-changed";
export function notifyDocsChanged(matterId: string | null | undefined) {
  if (matterId) window.dispatchEvent(new CustomEvent(DOCS_CHANGED_EVENT, { detail: { matterId } }));
}

export type UploadItem = {
  id: string;
  file: File;
  matterId: string;
  matterTitle: string;
  status: "waiting" | "uploading" | "done" | "error";
  error?: string;
};

let items: UploadItem[] = [];
const listeners = new Set<() => void>();
const emit = () => {
  items = [...items];
  listeners.forEach((l) => l());
};
const AT_ONCE = 2; // two files at a time

export function subscribeUploads(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export const getUploads = () => items;

export function enqueueUploads(matterId: string, matterTitle: string, files: File[]) {
  for (const file of files) items.push({ id: crypto.randomUUID(), file, matterId, matterTitle, status: "waiting" });
  emit();
  pump();
}

export function retryUpload(id: string) {
  items = items.map((x) => (x.id === id ? { ...x, status: "waiting", error: undefined } : x));
  emit();
  pump();
}

// Forget finished and failed ones (the panel's close button).
export function clearFinished() {
  items = items.filter((x) => x.status === "waiting" || x.status === "uploading");
  emit();
}
export function removeUpload(id: string) {
  items = items.filter((x) => x.id !== id || x.status === "uploading");
  emit();
}

export const isUploading = () => items.some((x) => x.status === "waiting" || x.status === "uploading");

function pump() {
  while (items.filter((x) => x.status === "uploading").length < AT_ONCE) {
    const next = items.find((x) => x.status === "waiting");
    if (!next) return;
    next.status = "uploading";
    emit();
    void run(next.id);
  }
}

async function run(id: string) {
  const item = items.find((x) => x.id === id);
  if (!item) return;
  try {
    await uploadAnyDocument(item.matterId, item.file);
    items = items.map((x) => (x.id === id ? { ...x, status: "done" } : x));
    notifyDocsChanged(item.matterId);
  } catch (e) {
    const msg = e instanceof UploadError ? e.message : "The upload failed. Please try again.";
    items = items.map((x) => (x.id === id ? { ...x, status: "error", error: msg } : x));
  }
  emit();
  pump();
}
