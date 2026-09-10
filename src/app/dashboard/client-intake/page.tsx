"use client";

import { useState } from "react";
import { SlidersHorizontal, RotateCw, Copy, Inbox, Ban } from "lucide-react";
import IntakeSettingsModal from "@/components/IntakeSettingsModal";

const fitTabs = ["All", "Fit", "Non-fit", "Unscored"] as const;
const statusTabs = ["New", "Created", "Rejected", "Stopped replying"] as const;

export default function ClientIntakePage() {
  const [fitFilter, setFitFilter] = useState<(typeof fitTabs)[number]>("All");
  const [statusFilter, setStatusFilter] = useState<(typeof statusTabs)[number]>("New");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const directLink = "https://app.powerailaw.com/i/yourfirm";

  function copyLink() {
    navigator.clipboard?.writeText(directLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="px-10 py-10">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-[28px] font-semibold mb-1">Client intake</h1>
          <p className="text-[14.5px] text-muted">Review submissions.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 bg-card-alt hover:bg-line/60 transition-colors px-3.5 py-2 rounded-full text-[13.5px] font-medium"
          >
            <SlidersHorizontal size={14} strokeWidth={1.75} /> Intake settings
          </button>
          <button className="w-9 h-9 rounded-full bg-card-alt hover:bg-line/60 transition-colors flex items-center justify-center">
            <RotateCw size={15} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {fitTabs.map((t) => (
          <button
            key={t}
            onClick={() => setFitFilter(t)}
            className={`px-3.5 py-1.5 rounded-full text-[13.5px] font-medium transition-colors ${
              fitFilter === t ? "bg-dark text-white" : "bg-card-alt text-muted hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-6 mb-6 border-b border-line">
        {statusTabs.map((t) => (
          <button
            key={t}
            onClick={() => setStatusFilter(t)}
            className={`pb-3 text-[14px] font-medium transition-colors ${
              statusFilter === t ? "text-ink border-b-2 border-ink" : "text-muted hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5">
        <div className="border border-line rounded-2xl overflow-hidden bg-white min-h-[560px] flex flex-col">
          <div className="px-5 py-4 flex items-center justify-between border-b border-line bg-card-alt flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <Ban size={16} strokeWidth={1.75} className="text-muted" />
              <span className="text-[14px] font-semibold">Intake form is not published</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSettingsOpen(true)}
                className="bg-dark text-white px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors"
              >
                Finish setup
              </button>
              <button
                onClick={copyLink}
                className="flex items-center gap-1.5 border border-line rounded-full px-4 py-2 text-[13.5px] font-medium hover:bg-cream transition-colors bg-white"
              >
                <Copy size={13} strokeWidth={1.75} /> {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-card-alt flex items-center justify-center mb-5">
              <Inbox size={22} strokeWidth={1.5} className="text-muted" />
            </div>
            <div className="text-[17px] font-semibold mb-1.5">Nothing waiting</div>
            <div className="text-[14px] text-muted">New completed intakes will appear here.</div>
          </div>
        </div>

        <div className="hidden lg:flex flex-col border border-line rounded-2xl bg-card-alt min-h-[560px] items-center justify-center text-center px-6">
          <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center mb-5">
            <Inbox size={22} strokeWidth={1.5} className="text-muted" />
          </div>
          <div className="text-[15px] font-medium text-muted">Select an intake submission</div>
        </div>
      </div>

      {settingsOpen && <IntakeSettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
