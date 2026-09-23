// Copies pdf.js runtime assets (worker, standard fonts, CMaps) from the
// installed pdfjs-dist into public/pdfjs so they're served by the app and
// always match the library version. Runs automatically after npm install.
import { cpSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pdfjs-dist");
const dest = join(root, "public", "pdfjs");

if (!existsSync(src)) {
  console.warn("[copy-pdfjs-assets] pdfjs-dist not installed; skipping");
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
cpSync(join(src, "legacy", "build", "pdf.worker.min.mjs"), join(dest, "pdf.worker.min.mjs"));
cpSync(join(src, "standard_fonts"), join(dest, "standard_fonts"), { recursive: true });
cpSync(join(src, "cmaps"), join(dest, "cmaps"), { recursive: true });
// Worker entry: polyfill first (imports run in order), then the real worker.
// Keeps Safari working, where ReadableStream has no async iterator.
writeFileSync(
  join(dest, "stream-polyfill.mjs"),
  `const proto = typeof ReadableStream !== "undefined" ? ReadableStream.prototype : null;
if (proto && typeof proto[Symbol.asyncIterator] !== "function") {
  const values = function ({ preventCancel = false } = {}) {
    const reader = this.getReader();
    const it = {
      async next() {
        try { const r = await reader.read(); if (r.done) reader.releaseLock(); return r; }
        catch (e) { reader.releaseLock(); throw e; }
      },
      async return(value) {
        if (!preventCancel) { const p = reader.cancel(value); reader.releaseLock(); await p; }
        else reader.releaseLock();
        return { done: true, value };
      },
      [Symbol.asyncIterator]() { return it; },
    };
    return it;
  };
  Object.defineProperty(proto, "values", { value: values, writable: true, configurable: true });
  Object.defineProperty(proto, Symbol.asyncIterator, { value: values, writable: true, configurable: true });
}
`
);
writeFileSync(
  join(dest, "pdf.worker.entry.mjs"),
  'import "./stream-polyfill.mjs";\nimport "./pdf.worker.min.mjs";\n'
);
console.log("[copy-pdfjs-assets] copied pdf.js worker, fonts and cmaps to public/pdfjs");
