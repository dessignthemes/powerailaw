const labels = ["12 AM", "3 AM", "6 AM", "9 AM", "12 PM", "3 PM", "6 PM", "9 PM", "12 AM"];

export default function TimeSlider() {
  const now = new Date();
  const pct = ((now.getHours() * 60 + now.getMinutes()) / (24 * 60)) * 100;

  return (
    <div>
      <div className="relative h-[3px] bg-line rounded-full mt-8 mb-3">
        <div
          className="absolute -top-[5px] w-[13px] h-[13px] rounded-full bg-muted border-2 border-white shadow-sm"
          style={{ left: `calc(${pct}% - 6.5px)` }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-muted">
        {labels.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
    </div>
  );
}
