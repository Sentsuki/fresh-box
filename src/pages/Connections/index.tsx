import { useEffect, useState, useMemo } from "react";
import { DismissRegular, SearchRegular } from "@fluentui/react-icons";
import {
  useConnectionsStream,
  formatConnectionValue,
} from "../../hooks/useConnectionsStream";
import { VirtualTable, type ColumnDef } from "../../components/ui/VirtualTable";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import type { ConnectionEntry, ConnectionColumnKey } from "../../types/app";

export default function Connections() {
  const {
    active,
    closed,
    entries,
    visibleColumns,
    startStream,
    stopStream,
    closeAll,
  } = useConnectionsStream();

  const [search, setSearch] = useState("");

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
        render: (row) => (
          <span className="truncate text-xs">
            {formatConnectionValue(col.key as ConnectionColumnKey, row)}
          </span>
        ),
      })),
    [visibleColumns],
  );

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center gap-3 flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-[var(--wb-text-primary)]">Connections</h1>
          <p className="text-sm text-[var(--wb-text-secondary)] mt-0.5">
            <Badge variant="success">{active.length} active</Badge>
            {" "}
            <Badge variant="subtle">{closed.length} closed</Badge>
          </p>
        </div>
        <div className="flex-1" />
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
        />
      </div>
    </div>
  );
}
