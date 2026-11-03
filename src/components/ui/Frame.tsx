import type { ComponentType, ReactNode } from "react";
import { frameOuter, frameInner, frameTitle } from "@/lib/ui";

// Widget frame: grey-blue outer frame, small mono title, white panel inside (same look as the dashboard widgets).
export default function Frame({
  title,
  icon: Icon,
  right,
  children,
  className = "",
  pad = "p-5",
}: {
  title?: ReactNode;
  icon?: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  pad?: string;
}) {
  return (
    <div className={`${frameOuter} flex flex-col ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-2.5 min-w-0">
          <span className={`${frameTitle} min-w-0`}>
            {Icon && <Icon size={15} strokeWidth={1.75} className="flex-shrink-0" />}
            <span className="truncate">{title}</span>
          </span>
          {right && <div className="flex-shrink-0">{right}</div>}
        </div>
      )}
      <div className={`${frameInner} flex-1 min-w-0 ${pad}`}>{children}</div>
    </div>
  );
}
