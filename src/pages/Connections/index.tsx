import { useEffect, useState, useMemo, useCallback } from "react";
import { DismissRegular, SearchRegular, PauseRegular, PlayRegular, ColumnRegular } from "@fluentui/react-icons";
import {
  useConnectionsStream,
  groupConnections,
  formatConnectionValue,
  allColumns,
} from "../../hooks/useConnectionsStream";
import type { ConnectionGroup } from "../../hooks/useConnectionsStream";
import { VirtualTable, type ColumnDef } from "../../components/ui/VirtualTable";
import { ConnectionDetailsModal } from "../../components/connections/ConnectionDetailsModal";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { useSettingsStore } from "../../stores/settingsStore";
import { coreRequest } from "../../services/coreClient";
import type { ConnectionEntry, ConnectionColumnKey } from "../../types/app";

export default function Connections() {
  const {
    active,
    closed,
    entries,
    rawEntries,
    visibleColumns,
    isPaused,
    groupedColumn,
    startStream,
    togglePause,
    closeAll,
    toggleGrouping,
    clearGrouping,
    toggleGroupCollapsed,
    isGroupCollapsed,
  } = useConnectionsStream();

  const currentTab = useSettingsStore((s) => s.settings.pages.connections.current_tab);
  const visibleColumnKeys = useSettingsStore((s) => s.settings.pages.connections.visible_columns);
  const columnOrder = useSettingsStore((s) => s.settings.pages.connections.column_order);
  const sortKey = useSettingsStore((s) => s.settings.pages.connections.sort_key);
  const sortDirection = useSettingsStore((s) => s.settings.pages.connections.sort_direction);
  const setConnectionsTab = useSettingsStore((s) => s.setConnectionsTab);
  const setConnectionsVisibleColumns = useSettingsStore((s) => s.setConnectionsVisibleColumns);
  const setConnectionsColumnOrder = useSettingsStore((s) => s.setConnectionsColumnOrder);
  const setConnectionsSortKey = useSettingsStore((s) => s.setConnectionsSortKey);
  const setConnectionsSortDirection = useSettingsStore((s) => s.setConnectionsSortDirection);

  const [search, setSearch] = useState("");
  const [showColumns, setShowColumns] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<ConnectionEntry | null>(null);

  useEffect(() => {
    startStream();
  }, [startStream]);

  const filteredEntries = useMemo(() => {
    if (!search) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) =>
      visibleColumns.some((col) =>
        formatConnectionValue(col.key, e).toLowerCase().includes(q),
      ),
    );
  }, [entries, visibleColumns, search]);

  const filteredRawEntries = useMemo(() => {
    if (!search) return rawEntries;
    const q = search.toLowerCase();
    return rawEntries.filter((e) =>
      visibleColumns.some((col) =>
        formatConnectionValue(col.key, e).toLowerCase().includes(q),
      ),
    );
  }, [rawEntries, visibleColumns, search]);

  const groupedEntries = useMemo<ConnectionGroup[] | null>(() => {
    if (!groupedColumn) return null;
    return groupConnections(filteredRawEntries, groupedColumn.key, sortKey, sortDirection);
  }, [filteredRawEntries, groupedColumn, sortKey, sortDirection]);

  const tableColumns: ColumnDef<ConnectionEntry>[] = useMemo(
    () =>
      visibleColumns.map((col) => ({
        key: col.key,
        label: col.label,
        align: col.align,
        sortable: col.sortable,
        render: (row) => (
          <span className="truncate text-xs">
            {formatConnectionValue(col.key as ConnectionColumnKey, row)}
          </span>
        ),
      })),
    [visibleColumns],
  );

  const handleSort = useCallback(
    (key: string) => {
      const colKey = key as ConnectionColumnKey;
      if (colKey === sortKey) {
        void setConnectionsSortDirection(sortDirection === "asc" ? "desc" : "asc");
      } else {
        const col = visibleColumns.find((c) => c.key === colKey);
        void setConnectionsSortKey(colKey);
        void setConnectionsSortDirection(col?.defaultDirection ?? "asc");
      }
    },
    [sortKey, sortDirection, visibleColumns, setConnectionsSortKey, setConnectionsSortDirection],
  );

  const toggleColumnVisible = useCallback(
    (key: ConnectionColumnKey) => {
      const next = visibleColumnKeys.includes(key)
        ? visibleColumnKeys.filter((k) => k !== key)
        : [...visibleColumnKeys, key];
      void setConnectionsVisibleColumns(next);
    },
    [visibleColumnKeys, setConnectionsVisibleColumns],
  );

  const moveColumn = useCallback(
    (key: ConnectionColumnKey, dir: -1 | 1) => {
      const idx = columnOrder.indexOf(key);
      if (idx < 0) return;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= columnOrder.length) return;
      const next = [...columnOrder];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      void setConnectionsColumnOrder(next);
    },
    [columnOrder, setConnectionsColumnOrder],
  );

  const disconnectConnection = useCallback(async (id: string) => {
    await coreRequest(`connections/${encodeURIComponent(id)}`, { method: "DELETE" });
  }, []);

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-(--wb-text-primary)">Connections</h1>
          <p className="text-sm text-(--wb-text-secondary) mt-0.5">
            <Badge variant="success">{active.length} active</Badge>
            {" "}
            <Badge variant="subtle">{closed.length} closed</Badge>
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-(--wb-radius-md) border border-(--wb-border-default) overflow-hidden">
          {(["active", "closed"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => void setConnectionsTab(tab)}
              className={[
                "px-3 py-1 text-sm capitalize transition-colors",
                currentTab === tab
                  ? "bg-(--wb-accent) text-white"
                  : "text-(--wb-text-secondary) hover:bg-(--wb-surface-hover)",
              ].join(" ")}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Grouped-by chip */}
        {groupedColumn && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-(--wb-accent)/15 text-(--wb-accent) border border-(--wb-accent)/30">
            <span>Grouped by {groupedColumn.label}</span>
            <button
              onClick={clearGrouping}
              className="hover:opacity-70 transition-opacity leading-none"
              title="Clear grouping"
            >
              ✕
            </button>
          </div>
        )}

        <div className="flex-1" />

        {/* Search */}
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-layer) min-w-48">
          <SearchRegular className="text-(--wb-text-tertiary)" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter..."
            className="flex-1 bg-transparent text-sm outline-none text-(--wb-text-primary) placeholder:text-(--wb-text-disabled)"
          />
          {search && (
            <button onClick={() => setSearch("")}>
              <DismissRegular className="text-(--wb-text-tertiary) text-xs" />
            </button>
          )}
        </div>

        {/* Pause */}
        <Button
          icon={isPaused ? <PlayRegular /> : <PauseRegular />}
          variant="subtle"
          onClick={togglePause}
        >
          {isPaused ? "Resume" : "Pause"}
        </Button>

        {/* Columns customization */}
        <div className="relative">
          <Button
            icon={<ColumnRegular />}
            variant="subtle"
            onClick={() => setShowColumns((v) => !v)}
          >
            Columns
          </Button>
          {showColumns && (
            <div className="absolute right-0 top-full mt-1 z-20 min-w-52 rounded-(--wb-radius-lg) border border-(--wb-border-default) bg-(--wb-surface-base) shadow-lg p-2 flex flex-col gap-0.5">
              {allColumns.map((col) => (
                <div key={col.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-(--wb-surface-hover)">
                  <input
                    type="checkbox"
                    id={`col-${col.key}`}
                    checked={visibleColumnKeys.includes(col.key)}
                    onChange={() => toggleColumnVisible(col.key)}
                    className="accent-(--wb-accent)"
                  />
                  <label htmlFor={`col-${col.key}`} className="flex-1 text-sm text-(--wb-text-primary) cursor-pointer">
                    {col.label}
                  </label>
                  {col.groupable && (
                    <button
                      onClick={() => toggleGrouping(col.key)}
                      title={groupedColumn?.key === col.key ? "Ungroup" : `Group by ${col.label}`}
                      className={[
                        "px-1.5 py-0.5 text-xs rounded transition-colors",
                        groupedColumn?.key === col.key
                          ? "bg-(--wb-accent) text-white"
                          : "text-(--wb-text-tertiary) hover:text-(--wb-text-primary) hover:bg-(--wb-surface-hover)",
                      ].join(" ")}
                    >
                      {groupedColumn?.key === col.key ? "Grouped" : "Group"}
                    </button>
                  )}
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => moveColumn(col.key, -1)}
                      className="text-(--wb-text-tertiary) hover:text-(--wb-text-primary) px-1 text-xs"
                      title="Move up"
                    >↑</button>
                    <button
                      onClick={() => moveColumn(col.key, 1)}
                      className="text-(--wb-text-tertiary) hover:text-(--wb-text-primary) px-1 text-xs"
                      title="Move down"
                    >↓</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Button icon={<DismissRegular />} variant="subtle" onClick={closeAll}>
          Close All
        </Button>
      </div>

      <div className="flex-1 min-h-0 rounded-(--wb-radius-lg) border border-(--wb-border-subtle) overflow-hidden">
        {groupedEntries ? (
          <GroupedTable
            groups={groupedEntries}
            columns={tableColumns}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
            isGroupCollapsed={isGroupCollapsed}
            onToggleGroupCollapsed={toggleGroupCollapsed}
            onRowClick={setSelectedConnection}
          />
        ) : (
          <VirtualTable
            columns={tableColumns}
            rows={filteredEntries}
            rowHeight={32}
            getRowKey={(row) => row.id}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
            onRowClick={setSelectedConnection}
          />
        )}
      </div>

      <ConnectionDetailsModal
        connection={selectedConnection}
        open={selectedConnection !== null}
        onClose={() => setSelectedConnection(null)}
        onDisconnect={disconnectConnection}
      />
    </div>
  );
}

interface GroupedTableProps {
  groups: ConnectionGroup[];
  columns: ColumnDef<ConnectionEntry>[];
  sortKey: ConnectionColumnKey;
  sortDirection: "asc" | "desc";
  onSort: (key: string) => void;
  isGroupCollapsed: (id: string) => boolean;
  onToggleGroupCollapsed: (id: string) => void;
  onRowClick: (row: ConnectionEntry) => void;
}

function GroupedTable({
  groups,
  columns,
  sortKey,
  sortDirection,
  onSort,
  isGroupCollapsed,
  onToggleGroupCollapsed,
  onRowClick,
}: GroupedTableProps) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-(--wb-surface-layer)">
          <tr>
            {columns.map((col) => {
              const isSorted = sortKey === col.key;
              const isClickable = col.sortable;
              return (
                <th
                  key={col.key}
                  onClick={isClickable ? () => onSort(col.key) : undefined}
                  className={[
                    "px-3 py-2 text-xs font-medium text-(--wb-text-secondary)",
                    "border-b border-(--wb-border-subtle) whitespace-nowrap select-none",
                    col.align === "end" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                    isClickable ? "cursor-pointer hover:text-(--wb-text-primary) hover:bg-(--wb-surface-hover)" : "",
                    isSorted ? "text-(--wb-text-primary)" : "",
                  ].join(" ")}
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
          {groups.map((group) => {
            const collapsed = isGroupCollapsed(group.id);
            return (
              <>
                <tr
                  key={`group-${group.id}`}
                  onClick={() => onToggleGroupCollapsed(group.id)}
                  className="cursor-pointer bg-(--wb-surface-layer) hover:bg-(--wb-surface-hover) transition-colors"
                >
                  <td
                    colSpan={columns.length}
                    className="border-b border-(--wb-border-subtle) px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-(--wb-text-secondary) text-xs shrink-0">
                          {collapsed ? "▶" : "▼"}
                        </span>
                        <span className="text-xs font-semibold text-(--wb-text-primary) truncate">
                          {group.column.label}: {group.label}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs text-(--wb-text-secondary) bg-(--wb-surface-base) px-2 py-0.5 rounded-full border border-(--wb-border-subtle)">
                        {group.items.length} {group.items.length === 1 ? "item" : "items"}
                      </span>
                    </div>
                  </td>
                </tr>
                {!collapsed &&
                  group.items.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => onRowClick(row)}
                      className="border-b border-(--wb-border-subtle) hover:bg-(--wb-surface-hover) transition-colors duration-75 cursor-pointer"
                      style={{ height: 32 }}
                    >
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={[
                            "px-3 text-xs text-(--wb-text-primary) truncate max-w-0",
                            col.align === "end" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                          ].join(" ")}
                        >
                          {col.render ? col.render(row, 0) : null}
                        </td>
                      ))}
                    </tr>
                  ))}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
