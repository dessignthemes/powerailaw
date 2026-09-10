"use client";

import { useState } from "react";
import { X, Paperclip } from "lucide-react";

const topics = [
  "The AI didn't help / gave a wrong answer",
  "Something looks broken / a bug",
  "Billing question",
  "Feature request",
  "Other",
];

export default function ContactSupportModal({
  email,
  onClose,
}: {
  email: string;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [replyTo, setReplyTo] = useState(email);
  const [topic, setTopic] = useState(topics[0]);
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [sent, setSent] = useState(false);

  const canSend = name.trim().length > 0 && description.trim().length > 0;

  function handleAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setAttachments((prev) => [...prev, ...files.map((f) => f.name)].slice(0, 5));
  }

  function handleSend() {
    if (!canSend) return;
    setSent(true);
    setTimeout(onClose, 1400);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="bg-cream rounded-3xl w-full max-w-[620px] max-h-[90vh] overflow-y-auto p-7">
        {sent ? (
          <div className="flex flex-col items-center justify-center text-center py-14">
            <div className="text-[18px] font-semibold mb-1.5">Sent to support</div>
            <p className="text-[14px] text-muted">We&apos;ll reply to {replyTo} shortly.</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-1.5">
              <h2 className="text-[22px] font-semibold">Contact support</h2>
              <button onClick={onClose} className="text-muted hover:text-ink">
                <X size={20} strokeWidth={1.75} />
              </button>
            </div>
            <p className="text-[13.5px] text-muted mb-6 max-w-[480px]">
              Tell us what you were doing, what you expected, and what actually happened. Adding
              screenshots helps us resolve it faster.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div>
                <div className="text-[13px] font-medium mb-1.5">Your name</div>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name"
                  className="w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none"
                />
              </div>
              <div>
                <div className="text-[13px] font-medium mb-1.5">Reply-to email</div>
                <input
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  className="w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none"
                />
              </div>
            </div>

            <div className="mb-5">
              <div className="text-[13px] font-medium mb-1.5">What&apos;s this about?</div>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-[14px] outline-none appearance-none"
              >
                {topics.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-5">
              <div className="text-[13px] font-medium mb-1.5">Describe the problem</div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What happened? Steps to reproduce, what you expected..."
                rows={4}
                className="w-full bg-white border border-line rounded-xl px-3.5 py-3 text-[14px] outline-none resize-none"
              />
            </div>

            <div className="mb-7">
              <label className="inline-flex items-center gap-1.5 bg-white border border-line px-4 py-2.5 rounded-xl text-[13.5px] font-medium cursor-pointer hover:bg-card-alt transition-colors">
                <Paperclip size={14} strokeWidth={1.75} />
                Attach screenshots ({attachments.length}/5)
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleAttach}
                  className="hidden"
                  disabled={attachments.length >= 5}
                />
              </label>
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {attachments.map((name, i) => (
                    <span key={i} className="bg-card-alt px-2.5 py-1 rounded-full text-[12px] text-muted">
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="flex-1 bg-white border border-line px-4 py-2.5 rounded-xl text-[14px] font-medium hover:bg-card-alt transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="flex-1 bg-dark text-white px-4 py-2.5 rounded-xl text-[14px] font-medium hover:bg-dark2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Send to support
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
