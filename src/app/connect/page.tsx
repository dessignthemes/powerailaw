"use client";

import { useState } from "react";

const items = [
  {
    key: "mail",
    name: "Outlook Mail",
    desc: "New client emails and documents get routed to your team the moment they arrive.",
    checked: true,
  },
  {
    key: "calendar",
    name: "Outlook Calendar",
    desc: "Deadlines and hearings land on the calendar you already check.",
    checked: true,
  },
  {
    key: "planner",
    name: "Microsoft Planner",
    desc: "Assigned documents show up as tasks your whole team can see.",
    checked: true,
  },
];

export default function ConnectPage() {
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(items.map((i) => [i.key, i.checked]))
  );

  const count = Object.values(selected).filter(Boolean).length;

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-6 py-16">
      <div className="max-w-[560px] w-full text-center">
        <h1 className="font-display text-[38px] font-semibold mb-3">
          Connect your practice
        </h1>
        <p className="text-[15px] text-muted leading-relaxed mb-10">
          Connect your mail, calendar and Planner. PowerAI Law sets up your
          intake routing from them in minutes.
        </p>

        <div className="bg-white border border-line rounded-3xl p-2 mb-6">
          <div className="grid grid-cols-2 gap-2 p-2">
            <div className="bg-card-alt rounded-xl py-2.5 text-[14px] font-medium">
              Microsoft 365
            </div>
            <div className="rounded-xl py-2.5 text-[14px] font-medium text-muted">
              Google
            </div>
          </div>

          <div className="flex flex-col divide-y divide-line px-2">
            {items.map((item) => (
              <label
                key={item.key}
                className="flex items-start justify-between gap-4 py-5 px-3 cursor-pointer text-left"
              >
                <div>
                  <div className="text-[15px] font-semibold mb-1">{item.name}</div>
                  <div className="text-[13px] text-muted leading-relaxed">{item.desc}</div>
                </div>
                <input
                  type="checkbox"
                  checked={selected[item.key]}
                  onChange={(e) =>
                    setSelected((s) => ({ ...s, [item.key]: e.target.checked }))
                  }
                  className="mt-1 w-[18px] h-[18px] accent-black flex-shrink-0"
                />
              </label>
            ))}
          </div>

          <div className="p-3">
            <a
              href="/api/auth/signin/microsoft"
              className="block bg-dark text-white text-center py-3.5 rounded-2xl text-[14.5px] font-semibold hover:bg-dark2 transition-colors"
            >
              Connect {count} selected
            </a>
            <button className="w-full text-center py-3 text-[13.5px] text-muted hover:text-ink transition-colors">
              I&rsquo;ll connect later
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[12.5px] text-muted">
          <span>🔒</span> Privacy first. Never used to train AI, seen only by your firm.
        </div>
      </div>
    </div>
  );
}
