import EmptyState from "@/components/EmptyState";

export default function TimeTrackingPage() {
  return (
    <div className="px-10 py-10">
      <h1 className="text-[28px] font-semibold mb-1">Time tracking</h1>
      <p className="text-[14.5px] text-muted mb-8">
        Track billable time against a matter as you work.
      </p>

      <EmptyState
        icon="◔"
        title="No time tracked yet"
        subtitle="Start a timer from any matter to begin tracking billable hours."
      />
    </div>
  );
}
