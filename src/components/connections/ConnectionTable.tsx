import { ColumnRegular } from "@fluentui/react-icons";
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getGroupedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnPinningState,
  type ColumnSizingState,
  type ExpandedState,
  type GroupingState,
  type Updater,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  formatConnectionValue,
  type ConnectionColumnOption,
} from "../../hooks/useConnectionsStream";
import { useToast } from "../../hooks/useToast";
import type {
  ConnectionColumnKey,
  ConnectionEntry,
  SortDirection,
} from "../../types/app";

interface ConnectionTableProps {
  rows: ConnectionEntry[];
  columns: ConnectionColumnOption[];
  sortKey: ConnectionColumnKey;
  sortDirection: SortDirection;
  groupedColumnKey: ConnectionColumnKey | null;
  pinnedColumnKeys: ConnectionColumnKey[];
  columnSizes: Record<string, number>;
  onSort: (key: ConnectionColumnKey) => void;
  onToggleGrouping: (key: ConnectionColumnKey) => void;
  onPinnedColumnsChange: (keys: ConnectionColumnKey[]) => void;
  onColumnSizesChange: (sizes: Record<string, number>) => void;
  onRowClick: (row: ConnectionEntry) => void;
}

function getPinnedStyles(
  pinned: "left" | "right" | false,
  offset: number,
  isHeader = false,
): CSSProperties {
  if (!pinned) return {};
  return {
    position: "sticky",
    ...(pinned === "left" ? { left: offset } : { right: offset }),
    zIndex: isHeader ? 20 : 10,
    background: "var(--wb-badge-default-bg)",
    boxShadow:
      pinned === "left"
        ? "1px 0 0 var(--wb-border-subtle)"
        : "-1px 0 0 var(--wb-border-subtle)",
  };
}

export function ConnectionTable({
  rows,
  columns,
  sortKey,
  sortDirection,
  groupedColumnKey,
  pinnedColumnKeys,
  columnSizes,
  onSort,
  onToggleGrouping,
  onPinnedColumnsChange,
  onColumnSizesChange,
  onRowClick,
}: ConnectionTableProps) {
  const [localColumnSizes, setLocalColumnSizes] = useState(columnSizes);
  const [expanded, setExpanded] = useState<ExpandedState>({});

  // Only sync from store on initial mount (columnSizes is stable unless
  // an external actor changes it). We do NOT unconditionally reset on every
  // reference change, because updateSettings deep-clones the whole settings
  // object, creating a new column_sizes reference even when values are
  // identical – which would cause a visible jump during a drag.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    // External change (e.g. settings reset): sync only when values differ.
    setLocalColumnSizes((prev) => {
      if (Object.keys(columnSizes).length !== Object.keys(prev).length)
        return columnSizes;
      for (const k in columnSizes) {
        if (columnSizes[k] !== prev[k]) return columnSizes;
      }
      return prev;
    });
  }, [columnSizes]);

  // Collapse all groups whenever the active grouping column changes.
  useEffect(() => {
    setExpanded({});
  }, [groupedColumnKey]);

  const saveSizesRef = useRef(onColumnSizesChange);
  saveSizesRef.current = onColumnSizesChange;
  const sizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleColumnSizingChange = useCallback(
    (updater: Updater<ColumnSizingState>) => {
      setLocalColumnSizes((old) => {
        const next = typeof updater === "function" ? updater(old) : updater;
        if (sizeTimeoutRef.current) clearTimeout(sizeTimeoutRef.current);
        sizeTimeoutRef.current = setTimeout(() => {
          saveSizesRef.current(next);
        }, 200);
        return next;
      });
    },
    [],
  );
  const columnPinning = useMemo<ColumnPinningState>(
    () => ({
      left: pinnedColumnKeys,
      right: [],
    }),
    [pinnedColumnKeys],
  );
  const groupingState = useMemo<GroupingState>(
    () => (groupedColumnKey ? [groupedColumnKey] : []),
    [groupedColumnKey],
  );
  const groupedColOption = useMemo(
    () => columns.find((c) => c.key === groupedColumnKey) ?? null,
    [columns, groupedColumnKey],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });
  const { success, error } = useToast();

  const tableColumns = useMemo<ColumnDef<ConnectionEntry>[]>(
    () =>
      columns.map((col) => ({
        id: col.key,
        accessorFn: (row) => formatConnectionValue(col.key, row),
        size:
          col.key === "host"
            ? 260
            : col.key === "rule"
              ? 220
              : col.key === "chain"
                ? 220
                : col.align === "end"
                  ? 130
                  : 170,
        enableSorting: col.sortable,
        enableGrouping: col.groupable,
        header: () => {
          const isGrouped = groupedColumnKey === col.key;
          const isPinned = pinnedColumnKeys.includes(col.key);
          return (
            <div className="flex items-center gap-1.5 group/header">
              <span className="truncate">{col.label}</span>
              {col.groupable && (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleGrouping(col.key);
                  }}
                  className={[
                    "p-0.5 rounded transition-all flex items-center justify-center shrink-0",
                    isGrouped
                      ? "bg-(--wb-accent) text-(--wb-accent-fg)"
                      : "bg-transparent text-(--wb-text-tertiary) hover:text-(--wb-text-primary) hover:bg-(--wb-surface-active)",
                  ].join(" ")}
                  title={isGrouped ? "Ungroup" : `Group by ${col.label}`}
                >
                  <ColumnRegular className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  const next = isPinned
                    ? pinnedColumnKeys.filter((id) => id !== col.key)
                    : [...pinnedColumnKeys, col.key];
                  onPinnedColumnsChange(next);
                }}
                className={[
                  "p-0.5 rounded transition-colors text-xs leading-none",
                  isPinned
                    ? "bg-(--wb-accent) text-(--wb-accent-fg)"
                    : "text-(--wb-text-tertiary) hover:text-(--wb-text-primary) hover:bg-(--wb-surface-active)",
                ].join(" ")}
                title={isPinned ? "Unpin column" : "Pin column"}
              >
                📌
              </button>
            </div>
          );
        },
        cell: (ctx) => (
          <span className="truncate text-[13px]">{String(ctx.getValue())}</span>
        ),
      })),
    [
      columns,
      groupedColumnKey,
      onPinnedColumnsChange,
      onToggleGrouping,
      pinnedColumnKeys,
    ],
  );

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    autoResetExpanded: false,
    enableColumnPinning: true,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    state: {
      columnPinning,
      columnSizing: localColumnSizes,
      grouping: groupingState,
      expanded,
    },
    onColumnSizingChange: handleColumnSizingChange,
    onExpandedChange: setExpanded,
    onColumnPinningChange: (updater) => {
      const nextValue =
        typeof updater === "function" ? updater(columnPinning) : updater;
      const nextLeft = (nextValue.left ?? []).filter(
        (id): id is ConnectionColumnKey => typeof id === "string",
      );
      onPinnedColumnsChange(nextLeft);
    },
  });

  const flatRows = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 40,
    overscan: 8,
  });

  const handleCellCopy = useCallback(
    async (value: string) => {
      try {
        await navigator.clipboard.writeText(value);
        success("Cell copied");
      } catch {
        error("Failed to copy cell");
      }
    },
    [error, success],
  );

  const onMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (
      target.closest(
        "button, input, select, textarea, a, [role='button'], [data-no-drag='true']",
      )
    ) {
      return;
    }
    const element = containerRef.current;
    if (!element) return;
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop,
    };
  }, []);

  const onMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const element = containerRef.current;
    if (!element) return;
    event.preventDefault();
    element.scrollLeft =
      dragRef.current.scrollLeft - (event.clientX - dragRef.current.startX);
    element.scrollTop =
      dragRef.current.scrollTop - (event.clientY - dragRef.current.startY);
  }, []);

  const onMouseUp = useCallback(() => {
    dragRef.current.active = false;
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto custom-scrollbar cursor-grab active:cursor-grabbing"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <div
        style={{ width: "100%", minWidth: Math.max(table.getTotalSize(), 900) }}
      >
        <div className="sticky top-0 z-20 bg-(--wb-surface-layer) border-b border-(--wb-border-subtle)">
          {table.getHeaderGroups().map((headerGroup) => (
            <div key={headerGroup.id} className="flex">
              {headerGroup.headers.map((header) => {
                const pinned = header.column.getIsPinned();
                const pinnedOffset =
                  pinned === "left"
                    ? header.column.getStart("left")
                    : pinned === "right"
                      ? header.column.getAfter("right")
                      : 0;
                const isSorted = sortKey === header.column.id;
                return (
                  <div
                    key={header.id}
                    className={[
                      "relative h-10 px-3 text-xs font-medium select-none border-r border-(--wb-border-subtle)",
                      header.column.columnDef.enableSorting
                        ? "cursor-pointer hover:bg-(--wb-surface-hover)"
                        : "",
                    ].join(" ")}
                    style={{
                      width: header.getSize(),
                      flexShrink: 0,
                      ...getPinnedStyles(pinned, pinnedOffset, true),
                    }}
                    onClick={
                      header.column.columnDef.enableSorting
                        ? () => onSort(header.column.id as ConnectionColumnKey)
                        : undefined
                    }
                  >
                    <div className="h-full flex items-center justify-between gap-2 text-(--wb-text-secondary)">
                      <span className="truncate">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </span>
                      {isSorted && (
                        <span className="text-(--wb-accent)">
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </div>
                    <div
                      data-no-drag="true"
                      onDoubleClick={() => header.column.resetSize()}
                      onMouseDown={header.getResizeHandler()}
                      className={[
                        "absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none touch-none",
                        "hover:bg-(--wb-accent)/60",
                      ].join(" ")}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div
          style={{
            height: rowVirtualizer.getTotalSize(),
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = flatRows[virtualRow.index];

            if (row.getIsGrouped()) {
              const groupValue = String(
                groupedColumnKey ? row.getValue(groupedColumnKey) : "",
              );
              const isExpanded = row.getIsExpanded();
              return (
                <div
                  key={row.id}
                  className="absolute left-0 w-full flex items-center justify-between border-b border-(--wb-border-subtle) px-3 cursor-pointer transition-colors bg-(--wb-accent)/15 hover:bg-(--wb-accent)/25"
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                    height: virtualRow.size,
                  }}
                  onClick={() => row.toggleExpanded()}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-(--wb-text-secondary) text-xs shrink-0">
                      {isExpanded ? "▼" : "▶"}
                    </span>
                    <span className="text-xs font-semibold text-(--wb-text-primary) truncate">
                      {groupedColOption?.label}: {groupValue}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-(--wb-text-secondary) bg-(--wb-surface-base) px-2 py-0.5 rounded-full border border-(--wb-border-subtle)">
                    {row.subRows.length}{" "}
                    {row.subRows.length === 1 ? "item" : "items"}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={row.id}
                className={[
                  "absolute left-0 w-full flex border-b border-(--wb-border-subtle)",
                  "hover:bg-(--wb-surface-hover) transition-colors duration-75 cursor-pointer",
                  virtualRow.index % 2 === 1 ? "bg-(--wb-surface-active)" : "",
                ].join(" ")}
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  height: virtualRow.size,
                }}
                onClick={() => onRowClick(row.original)}
              >
                {row.getVisibleCells().map((cell) => {
                  const pinned = cell.column.getIsPinned();
                  const pinnedOffset =
                    pinned === "left"
                      ? cell.column.getStart("left")
                      : pinned === "right"
                        ? cell.column.getAfter("right")
                        : 0;
                  const value = String(cell.getValue() ?? "");
                  return (
                    <div
                      key={cell.id}
                      className="h-full px-3 border-r border-(--wb-border-subtle) flex items-center text-[13px] text-(--wb-text-primary) truncate"
                      style={{
                        width: cell.column.getSize(),
                        flexShrink: 0,
                        ...getPinnedStyles(pinned, pinnedOffset),
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        void handleCellCopy(value);
                      }}
                      title={value}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
