"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import PdfEditor from "@/components/pdf/PdfEditor";

function EditorRoute() {
  const { documentId } = useParams<{ documentId: string }>();
  const search = useSearchParams();
  const version = search.get("version");
  // Keyed by version so switching or saving a version starts a clean editor.
  return (
    <PdfEditor
      key={`${documentId}:${version ?? "latest"}`}
      documentId={documentId}
      versionId={version}
      justSaved={search.get("saved") === "1"}
      initialPage={Number(search.get("page")) || 1}
    />
  );
}

export default function PowerPdfEditorPage() {
  return (
    <Suspense fallback={null}>
      <EditorRoute />
    </Suspense>
  );
}
