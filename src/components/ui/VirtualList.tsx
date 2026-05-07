import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  overscan?: number;
  className?: string;
  renderItem: (item: T, index: number) => React.ReactNode;
  getItemKey: (item: T, index: number) => string | number;
  autoScrollToEnd?: boolean;
}

const DEFAULT_OVERSCAN = 5;

export function VirtualList<T>({
  items,
  itemHeight,
  overscan = DEFAULT_OVERSCAN,
  className = "",
  renderItem,
  getItemKey,
  autoScrollToEnd = false,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const isAtEndRef = useRef(true);

  const updateRange = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const scrollTop = el.scrollTop;
    const clientHeight = el.clientHeight;
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const end = Math.min(
      items.length,
      Math.ceil((scrollTop + clientHeight) / itemHeight) + overscan,
    );
    setVisibleRange((prev) => {
      if (prev.start === start && prev.end === end) return prev;
      return { start, end };
    });
    // Track if user is scrolled to the bottom
    if (autoScrollToEnd) {
      const atEnd = el.scrollHeight - scrollTop - clientHeight < itemHeight * 2;
      isAtEndRef.current = atEnd;
    }
  }, [items.length, itemHeight, overscan, autoScrollToEnd]);

  useLayoutEffect(() => {
    updateRange();
  }, [updateRange, items.length]);

  // Auto-scroll to bottom when new items arrive and user was at the end
  useEffect(() => {
    if (!autoScrollToEnd || !isAtEndRef.current) return;
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, autoScrollToEnd]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let rafId: number | null = null;
    let pending = false;

    const onScroll = () => {
      if (pending) return;
      pending = true;
      rafId = requestAnimationFrame(() => {
        pending = false;
        updateRange();
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [updateRange]);

  const totalHeight = items.length * itemHeight;
  const visibleItems = items.slice(visibleRange.start, visibleRange.end);
  const paddingTop = visibleRange.start * itemHeight;
  const paddingBottom = Math.max(
    0,
    (items.length - visibleRange.end) * itemHeight,
  );

  return (
    <div
      ref={containerRef}
      className={["h-full overflow-auto", className].join(" ")}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ paddingTop, paddingBottom }}>
          {visibleItems.map((item, i) => {
            const idx = visibleRange.start + i;
            return (
              <div key={getItemKey(item, idx)}>{renderItem(item, idx)}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
