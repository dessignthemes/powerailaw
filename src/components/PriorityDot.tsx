import { priorityMeta, type TaskPriority } from "@/components/NewTaskModal";

// A task's priority as a small coloured circle: H, M or L (full word on hover).
export default function PriorityDot({ priority, size = 24 }: { priority: string; size?: number }) {
  const p: TaskPriority = priority === "High" || priority === "Low" ? priority : "Medium";
  return (
    <span
      title={`${p} priority`}
      aria-label={`${p} priority`}
      role="img"
      className="inline-flex items-center justify-center rounded-full font-semibold flex-shrink-0 select-none"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.48), backgroundColor: priorityMeta[p].bg, color: priorityMeta[p].text }}
    >
      {p[0]}
    </span>
  );
}
