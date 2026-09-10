"use client";

import {
  Sparkles,
  SquarePen,
  History,
  Pin,
  Minimize2,
  X,
  Plus,
  Folder,
  ChevronDown,
  Mic,
  ArrowUp,
  CornerDownRight,
} from "lucide-react";

const suggestions = ["Create a client", "What does a matter summary look like?"];

export default function AgentPage() {
  return (
    <div className="flex flex-col h-screen">
      <div className="px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[14px] font-medium text-muted">
          <Sparkles size={15} strokeWidth={1.75} />
          AI Assistant
        </div>
        <div className="flex items-center gap-4 text-muted">
          <SquarePen size={16} strokeWidth={1.75} />
          <History size={16} strokeWidth={1.75} />
          <Pin size={16} strokeWidth={1.75} />
          <Minimize2 size={16} strokeWidth={1.75} />
          <X size={16} strokeWidth={1.75} />
        </div>
      </div>
      <div className="border-b border-line" />

      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="text-center max-w-[560px] w-full">
          <h2 className="font-display text-[36px] font-semibold mb-8">
            Your practice, in chat.
          </h2>

          <div className="border border-line rounded-2xl px-5 py-4 mb-3 bg-card-alt">
            <input
              disabled
              placeholder="Ask anything"
              className="w-full bg-transparent outline-none text-[15px] placeholder:text-muted mb-4"
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full border border-line flex items-center justify-center text-muted">
                  <Plus size={14} strokeWidth={1.75} />
                </div>
                <div className="flex items-center gap-1.5 text-[13px] text-muted border border-line rounded-full px-3 py-1.5">
                  <Folder size={13} strokeWidth={1.75} />
                  No matter
                  <ChevronDown size={12} strokeWidth={1.75} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Mic size={16} strokeWidth={1.75} className="text-muted" />
                <div className="w-8 h-8 rounded-full bg-card flex items-center justify-center text-muted">
                  <ArrowUp size={15} strokeWidth={1.75} />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start gap-2 mb-6 px-1">
            {suggestions.map((s) => (
              <div
                key={s}
                className="flex items-center gap-2 text-[13.5px] text-muted"
              >
                <CornerDownRight size={13} strokeWidth={1.75} />
                {s}
              </div>
            ))}
          </div>

          <div className="inline-block bg-dark text-white text-[13px] font-medium px-4 py-2 rounded-full">
            Coming soon
          </div>
        </div>
      </div>
    </div>
  );
}
