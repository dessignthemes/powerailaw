import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Loaded from node_modules at runtime on the server (text extraction for
  // the AI Agent) rather than bundled.
  serverExternalPackages: ["pdfjs-dist", "mammoth"],
  // pdf.js loads its worker by path, which file tracing can't see.
  outputFileTracingIncludes: {
    "/api/ai/**": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", "./node_modules/pdfjs-dist/legacy/build/pdf.mjs"],
  },
};

export default nextConfig;
