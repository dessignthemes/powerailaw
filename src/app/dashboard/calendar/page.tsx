const days = Array.from({ length: 30 }, (_, i) => i + 1);

export default function CalendarPage() {
  return (
    <div className="px-10 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[28px] font-semibold">Calendar</h1>
        <button className="bg-dark text-white px-4 py-2 rounded-full text-[13.5px] font-medium">
          + Add
        </button>
      </div>

      <div className="bg-card-alt border border-line rounded-xl px-5 py-3 flex items-center justify-between mb-6">
        <span className="text-[13.5px] text-muted">
          Sync from Outlook Calendar to see your events here.
        </span>
        <a href="/connect" className="text-[13.5px] font-medium text-ink underline">
          Connect a calendar
        </a>
      </div>

      <div className="grid grid-cols-7 bg-card-alt border border-line rounded-xl overflow-hidden">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            className="text-[12.5px] font-medium text-muted px-3 py-2 border-b border-line bg-card-alt"
          >
            {d}
          </div>
        ))}
        {days.map((d) => (
          <div key={d} className="min-h-[90px] border-t border-r border-line px-3 py-2 text-[13px] text-muted">
            {d}
          </div>
        ))}
      </div>
    </div>
  );
}
