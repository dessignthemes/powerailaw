"use client";

import { useState } from "react";
import { putFile } from "@/lib/shares/types";

export type UploadItem = { key: string; file: File; pct: number; state: "waiting" | "uploading" | "done" | "error"; error?: string };

// Uploads files one at a time. `start` asks the server for a signed upload URL; `finish` confirms it.
export function useUploads() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const patch = (key: string, p: Partial<UploadItem>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const add = (files: FileList | File[]) =>
    setItems((list) => [
      ...list,
      ...Array.from(files).map((file) => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, pct: 0, state: "waiting" as const })),
    ]);
  const remove = (key: string) => setItems((list) => list.filter((i) => i.key !== key));
  const clear = () => setItems([]);

  async function run(
    start: (f: File) => Promise<{ fileId: string; uploadUrl: string }>,
    finish: (fileId: string) => Promise<unknown>,
    list = items
  ) {
    let ok = 0;
    for (const it of list) {
      if (it.state === "done") continue;
      patch(it.key, { state: "uploading", pct: 0, error: undefined });
      try {
        const { fileId, uploadUrl } = await start(it.file);
        await putFile(uploadUrl, it.file, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", (pct) => patch(it.key, { pct }));
        await finish(fileId);
        patch(it.key, { state: "done", pct: 100 });
        ok++;
      } catch (e) {
        patch(it.key, { state: "error", error: (e as Error).message });
      }
    }
    return ok;
  }

  return { items, add, remove, clear, run };
}

export async function api(url: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(d?.error ?? "Something went wrong. Please try again."), { code: d?.code });
  return d;
}
