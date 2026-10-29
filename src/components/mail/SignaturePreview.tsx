"use client";

import { useEffect, useRef, useState } from "react";
import { signaturePreviewDoc } from "@/lib/mail/signatureHtml";

// Shows a signature exactly as it goes out, in a frame where no scripts run.
export default function SignaturePreview({ html, className = "" }: { html: string; className?: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(60);
  const doc = signaturePreviewDoc(html);
  useEffect(() => {
    const f = ref.current;
    if (!f) return;
    const fit = () => {
      const b = f.contentDocument?.body;
      if (b) setH(Math.min(Math.max(b.scrollHeight + 6, 40), 900));
    };
    f.addEventListener("load", fit);
    const t = window.setInterval(fit, 400); // pictures finish loading after the page
    const stop = window.setTimeout(() => window.clearInterval(t), 4000);
    return () => (f.removeEventListener("load", fit), window.clearInterval(t), window.clearTimeout(stop));
  }, [doc]);
  // No scripts can run in the frame ("allow-same-origin" only lets us measure its height).
  return <iframe ref={ref} title="Signature preview" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcDoc={doc} style={{ height: h }} className={`w-full border-0 bg-white ${className}`} />;
}
