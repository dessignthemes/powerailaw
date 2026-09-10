const columns = [
  { key: "todo", label: "To do", color: "bg-muted-light" },
  { key: "progress", label: "In progress", color: "bg-blue-400" },
  { key: "waiting", label: "Waiting", color: "bg-amber-400" },
  { key: "done", label: "Done", color: "bg-green-500" },
];

export default function TaskBoardPage() {
  return (
    <div className="px-10 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[28px] font-semibold">Task Board</h1>
        <button className="bg-dark text-white px-4 py-2 rounded-full text-[13.5px] font-medium">
          + Add task
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        {["Me", "Overdue", "Due this week", "Waiting on client"].map((f) => (
          <div key={f} className="bg-card-alt px-3.5 py-1.5 rounded-full text-[13px] font-medium text-muted">
            {f}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {columns.map((col) => (
          <div key={col.key} className="bg-card-alt border border-line rounded-2xl p-4 min-h-[420px]">
            <div className="flex items-center gap-2 mb-4">
              <span className={`w-2 h-2 rounded-full ${col.color}`} />
              <span className="text-[13.5px] font-semibold">{col.label}</span>
              <span className="text-[12px] text-muted ml-auto">0</span>
            </div>
            <button className="w-full border border-dashed border-line rounded-xl py-3 text-[13px] text-muted hover:text-ink hover:border-ink transition-colors">
              + Add a task
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
