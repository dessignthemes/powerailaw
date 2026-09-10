import EmptyState from "@/components/EmptyState";

export default function InboxPage() {
  return (
    <div className="px-10 py-10 max-w-[1200px]">
      <h1 className="text-[28px] font-semibold mb-1">Inbox</h1>
      <p className="text-[14.5px] text-muted mb-8">
        Drag any email into your{" "}
        <span className="text-ink font-medium">To-Do Bucket</span> folder in
        Outlook and it shows up here, ready to assign.
      </p>

      <div className="border border-line rounded-2xl px-6 py-5 mb-8 flex items-center justify-between bg-card-alt">
        <div>
          <div className="text-[14.5px] font-semibold mb-1">To-Do Bucket folder</div>
          <div className="text-[13px] text-muted">Not connected yet</div>
        </div>
        <a
          href="/dashboard/connect"
          className="bg-dark text-white px-4 py-2 rounded-full text-[13.5px] font-medium hover:bg-dark2 transition-colors"
        >
          Connect Outlook
        </a>
      </div>

      <EmptyState
        icon="✉"
        title="Nothing waiting"
        subtitle="Emails dragged into your To-Do Bucket folder will appear here for assignment."
      />
    </div>
  );
}
