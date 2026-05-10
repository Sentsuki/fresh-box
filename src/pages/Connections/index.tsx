import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { PageHeader } from "../../components/ui/PageHeader";
import { ConnectionDetailsModal } from "../../components/connections/ConnectionDetailsModal";
import { ConnectionCtrl } from "../../components/connections/ConnectionCtrl";
import { ConnectionTable } from "../../components/connections/ConnectionTable";
import {
  formatConnectionValue,
  groupConnections,
  useConnectionsStream,
} from "../../hooks/useConnectionsStream";
import { useSettingsStore } from "../../stores/settingsStore";
import { coreRequest } from "../../services/coreClient";
import type { ConnectionColumnKey, ConnectionEntry } from "../../types/app";

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

  const currentTab = useSettingsStore(
    (state) => state.settings.connections.current_tab,
  );
  const visibleColumnKeys = useSettingsStore(
    (state) => state.settings.connections.visible_columns,
  );
  const columnOrder = useSettingsStore((state) => state.settings.connections.column_order);
  const sortKey = useSettingsStore((state) => state.settings.connections.sort_key);
  const sortDirection = useSettingsStore(
    (state) => state.settings.connections.sort_direction,
  );
  const setConnectionsTab = useSettingsStore((state) => state.setConnectionsTab);
  const setConnectionsVisibleColumns = useSettingsStore(
    (state) => state.setConnectionsVisibleColumns,
  );
  const setConnectionsColumnOrder = useSettingsStore(
    (state) => state.setConnectionsColumnOrder,
  );
  const setConnectionsSortKey = useSettingsStore(
    (state) => state.setConnectionsSortKey,
  );
  const setConnectionsSortDirection = useSettingsStore(
    (state) => state.setConnectionsSortDirection,
  );

  const [search, setSearch] = useState("");
  const [sourceIpFilter, setSourceIpFilter] = useState("all");
  const [showColumns, setShowColumns] = useState(false);
  const [selectedConnection, setSelectedConnection] =
    useState<ConnectionEntry | null>(null);

  useEffect(() => {
    startStream();
  }, [startStream]);

  const sourceIpOptions = useMemo(
    () => [...new Set(rawEntries.map((entry) => entry.metadata.sourceIP))].sort(),
    [rawEntries],
  );

  const matchesColumnFilter = useCallback(
    (entry: ConnectionEntry, query: string) => {
      if (!query.trim()) return true;
      const lowerQuery = query.toLowerCase();
      return visibleColumns.some((column) =>
        formatConnectionValue(column.key, entry).toLowerCase().includes(lowerQuery),
      );
    },
    [visibleColumns],
  );

  const matchesSourceIpFilter = useCallback(
    (entry: ConnectionEntry) => {
      if (sourceIpFilter === "all") return true;
      return entry.metadata.sourceIP === sourceIpFilter;
    },
    [sourceIpFilter],
  );

  const filteredEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          matchesColumnFilter(entry, search) &&
          matchesSourceIpFilter(entry),
      ),
    [entries, matchesColumnFilter, matchesSourceIpFilter, search],
  );

  const filteredRawEntries = useMemo(
    () =>
      rawEntries.filter(
        (entry) =>
          matchesColumnFilter(entry, search) &&
          matchesSourceIpFilter(entry),
      ),
    [matchesColumnFilter, matchesSourceIpFilter, rawEntries, search],
  );

  const groupedEntries = useMemo(() => {
    if (!groupedColumn) return null;
    return groupConnections(
      filteredRawEntries,
      groupedColumn.key,
      sortKey,
      sortDirection,
    );
  }, [filteredRawEntries, groupedColumn, sortDirection, sortKey]);

  const handleSort = useCallback(
    (key: ConnectionColumnKey) => {
      if (key === sortKey) {
        void setConnectionsSortDirection(sortDirection === "asc" ? "desc" : "asc");
        return;
      }
      const column = visibleColumns.find((item) => item.key === key);
      void setConnectionsSortKey(key);
      void setConnectionsSortDirection(column?.defaultDirection ?? "asc");
    },
    [
      setConnectionsSortDirection,
      setConnectionsSortKey,
      sortDirection,
      sortKey,
      visibleColumns,
    ],
  );

  const toggleColumnVisible = useCallback(
    (key: ConnectionColumnKey) => {
      const nextColumns = visibleColumnKeys.includes(key)
        ? visibleColumnKeys.filter((columnKey) => columnKey !== key)
        : [...visibleColumnKeys, key];
      void setConnectionsVisibleColumns(nextColumns);
    },
    [setConnectionsVisibleColumns, visibleColumnKeys],
  );

  const moveColumn = useCallback(
    (key: ConnectionColumnKey, direction: -1 | 1) => {
      const currentIndex = columnOrder.indexOf(key);
      if (currentIndex < 0) return;
      const nextIndex = currentIndex + direction;
      if (nextIndex < 0 || nextIndex >= columnOrder.length) return;
      const nextOrder = [...columnOrder];
      [nextOrder[currentIndex], nextOrder[nextIndex]] = [
        nextOrder[nextIndex],
        nextOrder[currentIndex],
      ];
      void setConnectionsColumnOrder(nextOrder);
    },
    [columnOrder, setConnectionsColumnOrder],
  );

  const disconnectConnection = useCallback(async (id: string) => {
    await coreRequest(`connections/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 pr-2">
        <PageHeader
          title="Connections"
          description="Monitor and manage active network streams routed through sing-box."
        >
          <div className="flex items-center gap-2">
            <Badge variant="success" className="px-3 py-1 font-medium">
              {active.length} active
            </Badge>
            <Badge variant="subtle" className="px-3 py-1">
              {closed.length} closed
            </Badge>
          </div>
        </PageHeader>
      </div>

      <div className="flex flex-col gap-4 h-full min-h-0 pr-2 pb-10">
        <ConnectionCtrl
          currentTab={currentTab}
          groupedColumnLabel={groupedColumn?.label ?? null}
          search={search}
          sourceIpFilter={sourceIpFilter}
          sourceIpOptions={sourceIpOptions}
          isPaused={isPaused}
          showColumns={showColumns}
          visibleColumnKeys={visibleColumnKeys}
          columnOrder={columnOrder}
          sortKey={sortKey}
          onSetTab={(tab) => void setConnectionsTab(tab)}
          onSearchChange={setSearch}
          onSourceIpFilterChange={setSourceIpFilter}
          onTogglePause={togglePause}
          onToggleColumnsPanel={() => setShowColumns((value) => !value)}
          onToggleColumnVisible={toggleColumnVisible}
          onMoveColumn={moveColumn}
          onClearGrouping={clearGrouping}
          onCloseAll={closeAll}
        />

        <div className="flex-1 min-h-0 rounded-xl border border-(--wb-border-subtle) bg-(--wb-surface-layer) shadow-sm overflow-hidden flex flex-col">
          <ConnectionTable
            rows={filteredEntries}
            columns={visibleColumns}
            groupedEntries={groupedEntries}
            sortKey={sortKey}
            sortDirection={sortDirection}
            groupedColumnKey={groupedColumn?.key ?? null}
            onSort={handleSort}
            onToggleGrouping={toggleGrouping}
            onRowClick={setSelectedConnection}
            isGroupCollapsed={isGroupCollapsed}
            onToggleGroupCollapsed={toggleGroupCollapsed}
          />
        </div>

        <ConnectionDetailsModal
          connection={selectedConnection}
          open={selectedConnection !== null}
          onClose={() => setSelectedConnection(null)}
          onDisconnect={disconnectConnection}
        />
      </div>
    </div>
  );
}
