import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export interface ColumnDef<T> {
  key: string;
  label: string;
  width?: number;
  align?: "start" | "end" | "center";
  render?: (row: T, index: number) => React.ReactNode;
  getValue?: (row: T) => string | number;
}

interface VirtualTableProps<T> {
  rows: T[];
  columns: ColumnDef<T>[];
  rowHeight?: number;
  overscan?: number;
  className?: string;
  onRowClick?: (row: T) => void;
  getRowKey: (row: T, index: number) => string;
}

const DEFAULT_ROW_HEIGHT = 32;
const DEFAULT_OVERSCAN = 5;

export function VirtualTable<T>({
  rows,
  columns,
  rowHeight = DEFAULT_ROW_HEIGHT,
  overscan = DEFAULT_OVERSCAN,
  className = "",
  onRowClick,
  getRowKey,
}: VirtualTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const scrollTopRef = useRef(0);

  const updateRange = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const scrollTop = el.scrollTop;
    scrollTopRef.current = scrollTop;
    const clientHeight = el.clientHeight;
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const end = Math.min(
      rows.length,
      Math.ceil((scrollTop + clientHeight) / rowHeight) + overscan,
    );
    setVisibleRange((prev) => {
      if (prev.start === start && prev.end === end) return prev;
      return { start, end };
    });
  }, [rows.length, rowHeight, overscan]);

  useLayoutEffect(() => {
    updateRange();
  }, [updateRange, rows.length]);

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

  const totalHeight = rows.length * rowHeight;
  const visibleRows = rows.slice(visibleRange.start, visibleRange.end);
  const paddingTop = visibleRange.start * rowHeight;
  const paddingBottom = Math.max(
    0,
    (rows.length - visibleRange.end) * rowHeight,
  );

  return (
    <div
      ref={containerRef}
      className={[
        "overflow-auto contain-strict",
        className,
      ].join(" ")}
      style={{ contain: "strict" }}
    >
      <table className="w-full border-collapse" style={{ minHeight: totalHeight }}>
        <thead className="sticky top-0 z-10 bg-[var(--wb-surface-layer)]">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={[
                  "px-3 py-2 text-xs font-medium text-[var(--wb-text-secondary)]",
                  "border-b border-[var(--wb-border-subtle)] whitespace-nowrap",
                  col.align === "end" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                ].join(" ")}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr>
              <td
                colSpan={columns.length}
                style={{ height: paddingTop, padding: 0 }}
              />
            </tr>
          )}
          {visibleRows.map((row, i) => {
            const absoluteIndex = visibleRange.start + i;
            return (
              <tr
                key={getRowKey(row, absoluteIndex)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={[
                  "border-b border-[var(--wb-border-subtle)]",
                  "hover:bg-[var(--wb-surface-hover)] transition-colors duration-75",
                  onRowClick ? "cursor-pointer" : "",
                ].join(" ")}
                style={{ height: rowHeight }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={[
                      "px-3 text-xs text-[var(--wb-text-primary)] truncate max-w-0",
                      col.align === "end" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                    ].join(" ")}
                  >
                    {col.render
                      ? col.render(row, absoluteIndex)
                      : col.getValue
                        ? col.getValue(row)
                        : null}
                  </td>
                ))}
              </tr>
            );
          })}
          {paddingBottom > 0 && (
            <tr>
              <td
                colSpan={columns.length}
                style={{ height: paddingBottom, padding: 0 }}
              />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
