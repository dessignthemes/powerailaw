export default function MattersPage() {
  return (
    <div className="px-10 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-[28px] font-semibold">Matters <span className="text-muted font-normal text-[18px]">/ 0</span></h1>
        <button className="bg-dark text-white px-4 py-2 rounded-full text-[13.5px] font-medium">
          + Add matter
        </button>
      </div>
      <div className="text-[14.5px] text-muted">No matters yet. Add one from the sidebar or here.</div>
    </div>
  );
}
