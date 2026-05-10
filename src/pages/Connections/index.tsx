import { useCallback, useEffect, useMemo, useState } from "react";
import { PauseRegular, PlayRegular } from "@fluentui/react-icons";
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
    toggleGroupCollapsed,
    isGroupCollapsed,
  } = useConnectionsStream();

  const currentTab = useSettingsStore(
    (state) => state.settings.connections.current_tab,
  );
  const visibleColumnKeys = useSettingsStore(
    (state) => state.settings.connections.visible_columns,
  );
  const pinnedColumnKeys = useSettingsStore(
    (state) => state.settings.connections.pinned_columns,
  );
  const sortKey = useSettingsStore(
    (state) => state.settings.connections.sort_key,
  );
  const sortDirection = useSettingsStore(
    (state) => state.settings.connections.sort_direction,
  );
  const setConnectionsTab = useSettingsStore(
    (state) => state.setConnectionsTab,
  );
  const setConnectionsVisibleColumns = useSettingsStore(
    (state) => state.setConnectionsVisibleColumns,
  );
  const setConnectionsPinnedColumns = useSettingsStore(
    (state) => state.setConnectionsPinnedColumns,
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
    () =>
      [...new Set(rawEntries.map((entry) => entry.metadata.sourceIP))].sort(),
    [rawEntries],
  );

  const matchesColumnFilter = useCallback(
    (entry: ConnectionEntry, query: string) => {
      if (!query.trim()) return true;
      const lowerQuery = query.toLowerCase();
      return visibleColumns.some((column) =>
        formatConnectionValue(column.key, entry)
          .toLowerCase()
          .includes(lowerQuery),
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
          matchesColumnFilter(entry, search) && matchesSourceIpFilter(entry),
      ),
    [entries, matchesColumnFilter, matchesSourceIpFilter, search],
  );

  const filteredRawEntries = useMemo(
    () =>
      rawEntries.filter(
        (entry) =>
          matchesColumnFilter(entry, search) && matchesSourceIpFilter(entry),
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
        void setConnectionsSortDirection(
          sortDirection === "asc" ? "desc" : "asc",
        );
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
      const currentIndex = visibleColumnKeys.indexOf(key);
      if (currentIndex < 0) return;
      const nextIndex = currentIndex + direction;
      if (nextIndex < 0 || nextIndex >= visibleColumnKeys.length) return;
      const nextVisible = [...visibleColumnKeys];
      [nextVisible[currentIndex], nextVisible[nextIndex]] = [
        nextVisible[nextIndex],
        nextVisible[currentIndex],
      ];
      void setConnectionsVisibleColumns(nextVisible);
    },
    [setConnectionsVisibleColumns, visibleColumnKeys],
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
          search={search}
          sourceIpFilter={sourceIpFilter}
          sourceIpOptions={sourceIpOptions}
          isPaused={isPaused}
          showColumns={showColumns}
          visibleColumnKeys={visibleColumnKeys}
          sortKey={sortKey}
          onSetTab={(tab) => void setConnectionsTab(tab)}
          onSearchChange={setSearch}
          onSourceIpFilterChange={setSourceIpFilter}
          onTogglePause={togglePause}
          onToggleColumnsPanel={() => setShowColumns((value) => !value)}
          onToggleColumnVisible={toggleColumnVisible}
          onMoveColumn={moveColumn}
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
            pinnedColumnKeys={pinnedColumnKeys}
            onSort={handleSort}
            onToggleGrouping={toggleGrouping}
            onPinnedColumnsChange={(keys) =>
              void setConnectionsPinnedColumns(keys)
            }
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

        <button
          onClick={togglePause}
          className={[
            "fixed bottom-10 right-6 z-50",
            "w-12 h-12 rounded-full",
            "flex items-center justify-center",
            "backdrop-blur-md",
            isPaused
              ? "bg-(--wb-accent) text-(--wb-accent-fg) hover:bg-(--wb-accent-hover)"
              : "bg-(--wb-surface-flyout) text-(--wb-text-primary) hover:bg-(--wb-surface-hover) border border-(--wb-border-subtle)",
            "transition-all duration-200",
          ].join(" ")}
          title={isPaused ? "Resume" : "Pause"}
        >
          {isPaused ? (
            <PlayRegular className="w-5 h-5" />
          ) : (
            <PauseRegular className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  );
}
