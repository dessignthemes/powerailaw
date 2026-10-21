"use client";

// The invisible layer behind an open dropdown: a click anywhere outside closes the
// dropdown (and does nothing else). The mouse wheel / trackpad passes straight
// through to whatever is under the cursor, so the page or window behind keeps
// scrolling with the dropdown open; no need to hover over the dropdown itself.
function scrollableUnder(x: number, y: number, self: HTMLElement, dy: number, dx: number): HTMLElement | null {
  const scrollsFrom = (start: HTMLElement | null) => {
    let el = start;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      const canY = /(auto|scroll|overlay)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1;
      const canX = /(auto|scroll|overlay)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1;
      const roomY = dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0;
      const roomX = dx > 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0;
      if ((canY && dy && roomY) || (canX && dx && roomX)) return el;
      el = el.parentElement;
    }
    return null;
  };
  self.style.pointerEvents = "none";
  const under = document.elementFromPoint(x, y) as HTMLElement | null;
  self.style.pointerEvents = "";
  // What's under the cursor; else the window the dropdown sits in (e.g. the cursor
  // is over the dark background around a task window); else the page.
  return scrollsFrom(under) ?? scrollsFrom(self.parentElement) ?? (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

export default function ClickAway({ onClose, className = "fixed inset-0 z-40" }: { onClose: () => void; className?: string }) {
  return (
    <div
      className={className}
      onClick={onClose}
      onWheel={(e) => {
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
        const dy = e.deltaY * unit;
        const dx = e.deltaX * unit;
        const target = scrollableUnder(e.clientX, e.clientY, e.currentTarget, dy, dx);
        target?.scrollBy({ top: dy, left: dx });
      }}
    />
  );
}
