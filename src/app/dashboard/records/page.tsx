import EmptyState from "@/components/EmptyState";

const tabs = ["Everything", "Clients", "Matters", "People", "Companies"];

export default function RecordsPage() {
  return (
    <div className="px-10 py-10">
      <h1 className="text-[28px] font-semibold mb-1">Records</h1>
      <p className="text-[14.5px] text-muted mb-6">
        0 records — 0 clients, 0 matters, 0 people, 0 companies
      </p>

      <div className="flex items-center justify-between mb-8">
        <div className="flex gap-2">
          {tabs.map((t, i) => (
            <div
              key={t}
              className={`px-3.5 py-1.5 rounded-full text-[13.5px] font-medium ${
                i === 0 ? "bg-dark text-white" : "bg-card-alt text-muted"
              }`}
            >
              {t} 0
            </div>
          ))}
        </div>
        <input
          disabled
          placeholder="Find a record..."
          className="border border-line rounded-full px-4 py-2 text-[13.5px] w-64 placeholder:text-muted"
        />
      </div>

      <EmptyState
        icon="▤"
        title="No records yet"
        subtitle="Matter, client, and entity records appear here after documents are filed or emails are linked."
      />
    </div>
  );
}
