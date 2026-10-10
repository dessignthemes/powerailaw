// Secure Files: shared between browser and server.

export const SHARE_DAYS = 7;
export const MAX_FILE_BYTES = 2 * 1024 ** 3; // 2 GB per file
export const MAX_FILES_SEND = 25;
export const MAX_FILES_REQUEST = 50;
export const SHARES_BUCKET = "file-shares";

export type ShareKind = "send" | "request";

export type ShareFile = {
  id: string;
  name: string;
  size: number;
  mime: string;
  addedBy: "firm" | "recipient";
  downloadCount: number;
  createdAt: string;
};

export type ShareEvent = { type: "opened" | "downloaded" | "uploaded" | "locked"; fileName: string | null; at: string };

export type Share = {
  id: string;
  kind: ShareKind;
  title: string;
  message: string;
  recipientEmail: string | null;
  hasPassword: boolean;
  createdAt: string;
  createdByEmail: string | null;
  expiresAt: string;
  revokedAt: string | null;
  purgedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  files: ShareFile[];
  status: "active" | "expired" | "cancelled";
};

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

// Uploads straight from the browser to storage (never through our server), with progress.
export function putFile(signedUrl: string, file: File, anonKey: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    if (anonKey) xhr.setRequestHeader("apikey", anonKey);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(uploadError(xhr.status, xhr.responseText))));
    xhr.onerror = () => reject(new Error("The upload was interrupted. Check your connection and try again."));
    xhr.send(file);
  });
}

function uploadError(status: number, body: string) {
  if (status === 413 || /too large|exceeded the maximum/i.test(body)) return "This file is larger than the upload limit.";
  return "The upload didn’t go through. Please try again.";
}
