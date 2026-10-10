"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Play, X } from "lucide-react";

// Put the video's address here when it's ready (e.g. a YouTube/Vimeo embed URL or "/overview.mp4").
const VIDEO_URL: string = "";

export default function SeeInAction({ variant = "card" }: { variant?: "card" | "link" }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {variant === "card" ? (
        <button
          onClick={() => setOpen(true)}
          className="group relative block w-[240px] h-[160px] overflow-hidden ring-1 ring-white/10 text-left"
          aria-label="See LawPower AI in action"
        >
          <Image src="/see-in-action.webp" alt="" fill sizes="240px" className="object-cover transition-transform duration-500 group-hover:scale-105" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3 bg-black/85 px-4 py-2.5 text-white text-[17px] font-medium whitespace-nowrap">
            <Play size={20} fill="currentColor" strokeWidth={0} /> See in action
          </span>
        </button>
      ) : (
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 text-white/90 hover:text-white text-[15px] font-medium">
          <span className="w-9 h-9 rounded-full border border-white/40 flex items-center justify-center">
            <Play size={14} fill="currentColor" strokeWidth={0} />
          </span>
          See in action
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="Video overview">
          <div className="relative w-full max-w-[960px] aspect-video bg-black overflow-hidden rounded-xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
            {VIDEO_URL ? (
              VIDEO_URL.endsWith(".mp4") ? (
                <video src={VIDEO_URL} controls autoPlay className="w-full h-full" />
              ) : (
                <iframe src={VIDEO_URL} title="LawPower AI overview" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="w-full h-full" />
              )
            ) : (
              <>
                <Image src="/see-in-action.webp" alt="" fill sizes="960px" className="object-cover opacity-30" />
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                  <span className="w-16 h-16 rounded-full bg-white/10 ring-1 ring-white/30 flex items-center justify-center mb-5">
                    <Play size={26} fill="white" strokeWidth={0} className="ml-1" />
                  </span>
                  <div className="text-white text-[24px] md:text-[30px] font-semibold" style={{ fontFamily: "var(--font-body)" }}>
                    Video overview coming soon
                  </div>
                  <div className="text-white/70 text-[15px] mt-2 max-w-[440px]">
                    A short walkthrough of LawPower AI is on its way. In the meantime, start a free trial and see it for yourself.
                  </div>
                  <a href="/connect" className="mt-6 bg-white text-ink px-5 py-3 rounded-lg text-[15px] font-medium hover:bg-[#ECEDEF] transition-colors">
                    Start Free Trial
                  </a>
                </div>
              </>
            )}
            <button onClick={() => setOpen(false)} aria-label="Close" className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 hover:bg-black text-white flex items-center justify-center">
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
