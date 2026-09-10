export default function DashboardHome() {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="px-10 py-10 max-w-[1200px]">
      <h1 className="text-[32px] font-semibold mb-1">Good afternoon</h1>
      <div className="text-[14.5px] text-muted mb-10">{today}</div>

      <div className="flex gap-6 mb-4 text-[14px] font-medium text-muted border-b border-line">
        <div className="pb-3 border-b-2 border-ink text-ink">Today</div>
        <div className="pb-3">Week</div>
        <div className="pb-3">Next week</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6">
        <div className="bg-white/60 border border-line rounded-2xl p-6">
          <div className="text-[13px] font-medium text-muted mb-6">Due today</div>
          <div className="text-3xl font-display font-semibold mb-1">0 tasks</div>
        </div>
        <div className="bg-white/60 border border-line rounded-2xl p-6">
          <div className="text-[13px] font-medium text-muted mb-6">Calendar</div>
          <div className="text-3xl font-display font-semibold mb-1">0 events</div>
          <div className="text-[13px] text-muted">Nothing scheduled today</div>
        </div>
        <div className="bg-white/60 border border-line rounded-2xl p-6">
          <div className="text-[13px] font-medium text-muted mb-6">Tracked</div>
          <div className="text-3xl font-display font-semibold mb-1">0m</div>
          <div className="text-[13px] text-muted">0m this week</div>
        </div>
      </div>

      <div className="bg-white/60 border border-line rounded-2xl p-6 mt-5">
        <div className="flex gap-6 text-[14px] font-medium text-muted mb-6">
          <div className="text-ink border-b-2 border-ink pb-2">Tasks</div>
          <div className="pb-2">Events</div>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-[15px] font-medium mb-1">Nothing due today</div>
        </div>
      </div>
    </div>
  );
}
