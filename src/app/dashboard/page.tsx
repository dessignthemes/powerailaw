import TimeSlider from "@/components/TimeSlider";
import {
  ListChecks,
  Calendar,
  Timer,
  Activity,
  CalendarCheck,
} from "lucide-react";

export default function DashboardHome() {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="px-10 py-10">
      <h1 className="text-[32px] font-semibold mb-1">Good afternoon</h1>
      <div className="text-[14.5px] text-muted mb-10">{today}</div>

      <div className="flex gap-6 mb-8 text-[14px] font-medium text-muted border-b border-line">
        <div className="pb-3 border-b-2 border-ink text-ink flex items-center gap-1.5">
          <Calendar size={15} strokeWidth={1.75} /> Today
        </div>
        <div className="pb-3 flex items-center gap-1.5">
          <Calendar size={15} strokeWidth={1.75} /> Week
        </div>
        <div className="pb-3 flex items-center gap-1.5">
          <Calendar size={15} strokeWidth={1.75} /> Next week
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-card-alt rounded-2xl p-6 relative">
          <div className="text-[13.5px] font-medium text-muted mb-8 flex items-center gap-1.5">
            <ListChecks size={15} strokeWidth={1.75} /> Due today
          </div>
          <div className="absolute top-6 right-6 w-6 h-6 rounded-full border-2 border-line" />
          <div className="text-[32px] font-display font-semibold">0 tasks</div>
        </div>

        <div className="bg-card-alt rounded-2xl p-6">
          <div className="text-[13.5px] font-medium text-muted mb-8 flex items-center gap-1.5">
            <Calendar size={15} strokeWidth={1.75} /> Calendar
          </div>
          <div className="text-[32px] font-display font-semibold mb-1">0 events</div>
          <div className="text-[13px] text-muted mb-2">Nothing scheduled today</div>
          <TimeSlider />
        </div>

        <div className="bg-card-alt rounded-2xl p-6">
          <div className="text-[13.5px] font-medium text-muted mb-8 flex items-center gap-1.5">
            <Timer size={15} strokeWidth={1.75} /> Tracked
          </div>
          <div className="text-[32px] font-display font-semibold mb-1">0m</div>
          <div className="text-[13px] text-muted mb-2">0m this week</div>
          <TimeSlider />
        </div>
      </div>

      <div className="bg-card-alt rounded-2xl p-6 mt-5">
        <div className="flex gap-6 text-[14px] font-medium text-muted mb-6">
          <div className="text-ink border-b-2 border-ink pb-2 flex items-center gap-1.5">
            <ListChecks size={15} strokeWidth={1.75} /> Tasks
          </div>
          <div className="pb-2 flex items-center gap-1.5">
            <Calendar size={15} strokeWidth={1.75} /> Events
          </div>
        </div>
        <div className="bg-cream rounded-xl flex flex-col items-center justify-center py-16 text-center">
          <div className="w-8 h-8 rounded-md border border-line flex items-center justify-center text-muted mb-3">
            <CalendarCheck size={16} strokeWidth={1.75} />
          </div>
          <div className="text-[15px] font-medium">Nothing due today</div>
        </div>
      </div>

      <div className="bg-card-alt rounded-2xl p-6 mt-5">
        <div className="text-[14px] font-medium text-ink mb-6 flex items-center gap-1.5">
          <Activity size={15} strokeWidth={1.75} /> Recent activity
        </div>
        <div className="bg-cream rounded-xl flex flex-col items-center justify-center py-20 text-center">
          <Activity size={20} strokeWidth={1.5} className="text-muted mb-3" />
          <div className="text-[15px] font-medium text-muted">No activity yet</div>
        </div>
      </div>
    </div>
  );
}
