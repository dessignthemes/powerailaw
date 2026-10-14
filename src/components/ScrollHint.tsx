"use client";

import { useEffect, useState, type RefObject } from "react";

// Under a list that scrolls inside its box: "↓ Scroll for 2 more" (click to scroll),
// "↑ Back to top" at the end. For browsers that hide scrollbars.
export default function ScrollHint({ list, total, visible = 3 }: { list: RefObject<HTMLDivElement | null>; total: number; visible?: number }) {
  const [atEnd, setAtEnd] = useState(false);
  const [hidden, setHidden] = useState(total - visible);

  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const update = () => {
      setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
      // rows still below the visible area (each row ≈ the list height / visible rows)
      const rowH = el.clientHeight / visible || 40;
      setHidden(Math.max(0, Math.round((el.scrollHeight - el.clientHeight - el.scrollTop) / rowH)));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [list, total, visible]);

  if (total <= visible) return null;
  return (
    <button
      type="button"
      onClick={() => {
        const el = list.current;
        if (!el) return;
        el.scrollTo({ top: atEnd ? 0 : el.scrollTop + el.clientHeight, behavior: "smooth" });
      }}
      className="mt-2 text-[12.5px] font-medium text-muted hover:text-ink transition-colors"
    >
      {atEnd ? "↑ Back to top" : `↓ Scroll for ${hidden || total - visible} more`}
    </button>
  );
}
