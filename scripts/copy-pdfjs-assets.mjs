// Copies pdf.js runtime assets (worker, standard fonts, CMaps) from the
// installed pdfjs-dist into public/pdfjs so they're served by the app and
// always match the library version. Runs automatically after npm install.
import { cpSync, mkdirSync, existsSync } from "node:fs";
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
console.log("[copy-pdfjs-assets] copied pdf.js worker, fonts and cmaps to public/pdfjs");
