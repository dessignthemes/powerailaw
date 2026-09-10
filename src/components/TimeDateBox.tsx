"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

function StepperRow({
  value,
  onPrev,
  onNext,
}: {
  value: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-1">
      <button onClick={onPrev} className="text-muted hover:text-ink p-1">
        <ChevronLeft size={15} strokeWidth={1.75} />
      </button>
      <span className="text-[15px] font-medium">{value}</span>
      <button onClick={onNext} className="text-muted hover:text-ink p-1">
        <ChevronRight size={15} strokeWidth={1.75} />
      </button>
    </div>
  );
}

export function TimeDateBox({
  timeLabel,
  dateLabel,
  onTimePrev,
  onTimeNext,
  onDatePrev,
  onDateNext,
}: {
  timeLabel: string;
  dateLabel: string;
  onTimePrev: () => void;
  onTimeNext: () => void;
  onDatePrev: () => void;
  onDateNext: () => void;
}) {
  return (
    <div className="flex-1 bg-card-alt rounded-xl py-2.5">
      <StepperRow value={timeLabel} onPrev={onTimePrev} onNext={onTimeNext} />
      <div className="border-t border-line my-2" />
      <StepperRow value={dateLabel} onPrev={onDatePrev} onNext={onDateNext} />
    </div>
  );
}
