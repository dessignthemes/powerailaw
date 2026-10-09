"use client";

import { useCallback, useEffect, useState } from "react";
import type { TaskTemplate, TemplateSection } from "@/lib/checklist";

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d?.error ?? "Something went wrong. Please try again.");
  return d;
}

// The firm's checklist templates.
export function useTemplates() {
  const [templates, setTemplates] = useState<TaskTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await call("/api/task-templates", "GET");
      setTemplates(d.templates ?? []);
      setError(null);
    } catch (e) {
      setTemplates([]);
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    let live = true;
    call("/api/task-templates", "GET")
      .then((d) => live && setTemplates(d.templates ?? []))
      .catch((e: Error) => {
        if (!live) return;
        setTemplates([]);
        setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);

  const save = useCallback(async (t: { id?: string; name: string; sections: TemplateSection[] }) => {
    const d = t.id
      ? await call(`/api/task-templates/${t.id}`, "PATCH", { name: t.name, sections: t.sections })
      : await call("/api/task-templates", "POST", { name: t.name, sections: t.sections });
    const saved = d.template as TaskTemplate;
    setTemplates((list) => [...(list ?? []).filter((x) => x.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
    return saved;
  }, []);

  const remove = useCallback(async (id: string) => {
    await call(`/api/task-templates/${id}`, "DELETE");
    setTemplates((list) => (list ?? []).filter((x) => x.id !== id));
  }, []);

  return { templates, error, reload: load, save, remove };
}
