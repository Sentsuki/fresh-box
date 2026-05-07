import { useEffect, useState, useMemo, useCallback } from "react";
import { DismissRegular, SearchRegular, PauseRegular, PlayRegular, ColumnRegular } from "@fluentui/react-icons";
import {
  useConnectionsStream,
  formatConnectionValue,
  allColumns,
} from "../../hooks/useConnectionsStream";
import { VirtualTable, type ColumnDef } from "../../components/ui/VirtualTable";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { useSettingsStore } from "../../stores/settingsStore";
import type { ConnectionEntry, ConnectionColumnKey } from "../../types/app";

export default function Connections() {
  const {
    active,
    closed,
    entries,
    visibleColumns,
    isPaused,
    startStream,
    stopStream,
    togglePause,
    closeAll,
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

  useEffect(() => {
    startStream();
    return () => stopStream(false);
  }, [startStream, stopStream]);

  const filteredEntries = useMemo(() => {
    if (!search) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) =>
      visibleColumns.some((col) =>
        formatConnectionValue(col.key, e).toLowerCase().includes(q),
      ),
    );
  }, [entries, visibleColumns, search]);

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

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-[var(--wb-text-primary)]">Connections</h1>
          <p className="text-sm text-[var(--wb-text-secondary)] mt-0.5">
            <Badge variant="success">{active.length} active</Badge>
            {" "}
            <Badge variant="subtle">{closed.length} closed</Badge>
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-[var(--wb-radius-md)] border border-[var(--wb-border-default)] overflow-hidden">
          {(["active", "closed"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => void setConnectionsTab(tab)}
              className={[
                "px-3 py-1 text-sm capitalize transition-colors",
                currentTab === tab
                  ? "bg-[var(--wb-accent)] text-white"
                  : "text-[var(--wb-text-secondary)] hover:bg-[var(--wb-surface-hover)]",
              ].join(" ")}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-[var(--wb-radius-md)] border border-[var(--wb-border-default)] bg-[var(--wb-surface-layer)] min-w-48">
          <SearchRegular className="text-[var(--wb-text-tertiary)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter..."
            className="flex-1 bg-transparent text-sm outline-none text-[var(--wb-text-primary)] placeholder:text-[var(--wb-text-disabled)]"
          />
          {search && (
            <button onClick={() => setSearch("")}>
              <DismissRegular className="text-[var(--wb-text-tertiary)] text-xs" />
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
            <div className="absolute right-0 top-full mt-1 z-20 min-w-48 rounded-[var(--wb-radius-lg)] border border-[var(--wb-border-default)] bg-[var(--wb-surface-base)] shadow-lg p-2 flex flex-col gap-0.5">
              {allColumns.map((col) => (
                <div key={col.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--wb-surface-hover)]">
                  <input
                    type="checkbox"
                    id={`col-${col.key}`}
                    checked={visibleColumnKeys.includes(col.key)}
                    onChange={() => toggleColumnVisible(col.key)}
                    className="accent-[var(--wb-accent)]"
                  />
                  <label htmlFor={`col-${col.key}`} className="flex-1 text-sm text-[var(--wb-text-primary)] cursor-pointer">
                    {col.label}
                  </label>
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => moveColumn(col.key, -1)}
                      className="text-[var(--wb-text-tertiary)] hover:text-[var(--wb-text-primary)] px-1 text-xs"
                      title="Move up"
                    >↑</button>
                    <button
                      onClick={() => moveColumn(col.key, 1)}
                      className="text-[var(--wb-text-tertiary)] hover:text-[var(--wb-text-primary)] px-1 text-xs"
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

      <div className="flex-1 min-h-0 rounded-[var(--wb-radius-lg)] border border-[var(--wb-border-subtle)] overflow-hidden">
        <VirtualTable
          columns={tableColumns}
          rows={filteredEntries}
          rowHeight={32}
          getRowKey={(row) => row.id}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      </div>
    </div>
  );
}
