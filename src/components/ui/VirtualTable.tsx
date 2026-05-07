import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export interface ColumnDef<T> {
  key: string;
  label: React.ReactNode;
  width?: number;
  align?: "start" | "end" | "center";
  sortable?: boolean;
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
  sortKey?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (key: string) => void;
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
  sortKey,
  sortDirection,
  onSort,
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
        "h-full overflow-auto",
        className,
      ].join(" ")}
    >
      <table className="w-full border-collapse" style={{ minHeight: totalHeight }}>
        <thead className="sticky top-0 z-10 bg-(--wb-surface-layer)">
          <tr>
            {columns.map((col) => {
              const isSorted = sortKey === col.key;
              const isClickable = col.sortable && onSort;
              return (
                <th
                  key={col.key}
                  onClick={isClickable ? () => onSort(col.key) : undefined}
                  className={[
                    "px-4 py-2.5 text-xs font-medium text-(--wb-text-secondary)",
                    "border-b border-(--wb-border-subtle) whitespace-nowrap select-none",
                    col.align === "end" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                    isClickable ? "cursor-pointer hover:text-(--wb-text-primary) hover:bg-(--wb-surface-hover)" : "",
                    isSorted ? "text-(--wb-text-primary)" : "",
                  ].join(" ")}
                  style={col.width ? { width: col.width } : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {isSorted && (
                      <span className="text-(--wb-accent)">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </span>
                </th>
              );
            })}
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
                  "border-b border-(--wb-border-subtle)",
                  "hover:bg-(--wb-surface-hover) transition-colors duration-75",
                  onRowClick ? "cursor-pointer" : "",
                  absoluteIndex % 2 === 1 ? "bg-(--wb-surface-active)" : "",
                ].join(" ")}
                style={{ height: rowHeight }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={[
                      "px-4 text-[13px] text-(--wb-text-primary) truncate max-w-0",
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
