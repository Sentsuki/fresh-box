import {
  ColumnRegular,
  DismissRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import { Popover } from "@base-ui/react/popover";
import { Button } from "../../components/ui/Button";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Select } from "../../components/ui/Select";
import { allColumns } from "../../hooks/useConnectionsStream";
import type { ConnectionColumnKey, ConnectionPageTab } from "../../types/app";

interface ConnectionCtrlProps {
  currentTab: ConnectionPageTab;
  search: string;
  sourceIpFilter: string;
  sourceIpOptions: string[];
  isPaused: boolean;
  visibleColumnKeys: ConnectionColumnKey[];
  sortKey: ConnectionColumnKey;
  onSetTab: (tab: ConnectionPageTab) => void;
  onSearchChange: (value: string) => void;
  onSourceIpFilterChange: (value: string) => void;
  onTogglePause: () => void;
  onToggleColumnVisible: (key: ConnectionColumnKey) => void;
  onMoveColumn: (key: ConnectionColumnKey, dir: -1 | 1) => void;
  onCloseAll: () => void;
}

const TAB_OPTIONS = [
  { value: "active", label: "active" },
  { value: "closed", label: "closed" },
] as const satisfies readonly { value: ConnectionPageTab; label: string }[];

export function ConnectionCtrl({
  currentTab,
  search,
  sourceIpFilter,
  sourceIpOptions,
  visibleColumnKeys,
  onSetTab,
  onSearchChange,
  onSourceIpFilterChange,
  onToggleColumnVisible,
  onMoveColumn,
  onCloseAll,
}: ConnectionCtrlProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <SegmentedControl
          value={currentTab}
          onValueChange={(tab) => {
            if (tab) onSetTab(tab);
          }}
          options={TAB_OPTIONS}
          className="overflow-hidden p-0.5"
          itemClassName="px-4 py-1.5 text-sm font-medium capitalize"
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {/* Source IP */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-layer)">
          <span className="text-xs font-semibold uppercase tracking-wide text-(--wb-text-tertiary)">
            Source IP
          </span>
          <Select
            variant="ghost"
            aria-label="Source IP"
            value={sourceIpFilter}
            onValueChange={onSourceIpFilterChange}
            options={[
              { value: "all", label: "All" },
              ...sourceIpOptions.map((ip) => ({ value: ip, label: ip })),
            ]}
          />
        </div>

        {/* Search Box */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-layer) min-w-48">
          <SearchRegular className="text-(--wb-text-tertiary)" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter..."
            className="flex-1 bg-transparent text-sm outline-none text-(--wb-text-primary) placeholder:text-(--wb-text-disabled)"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              className="hover:bg-(--wb-surface-hover) rounded p-0.5"
            >
              <DismissRegular className="text-(--wb-text-tertiary) text-xs" />
            </button>
          )}
        </div>

        <div className="flex-1" />

        {/* Close All */}
        <Button icon={<DismissRegular />} variant="subtle" onClick={onCloseAll}>
          Close All
        </Button>

        {/* Columns */}
        <Popover.Root>
          <Popover.Trigger
            render={<Button icon={<ColumnRegular />} variant="subtle" />}
          >
            Columns
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner
              side="bottom"
              align="end"
              sideOffset={8}
              className="z-50"
            >
              <Popover.Popup className="min-w-64 rounded-xl border border-(--wb-border-default) bg-(--wb-surface-flyout) backdrop-blur-xl p-2 flex flex-col gap-0.5 outline-none transition-[opacity,scale] duration-150 origin-(--transform-origin) data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95">
                <div className="px-3 py-2 text-xs font-semibold text-(--wb-text-tertiary) uppercase tracking-wider">
                  Visible Columns
                </div>
                <div className="max-h-[60vh] overflow-y-auto px-1">
                  {allColumns
                    .slice()
                    .sort((a, b) => {
                      const aVisibleIndex = visibleColumnKeys.indexOf(a.key);
                      const bVisibleIndex = visibleColumnKeys.indexOf(b.key);
                      const aVisible = aVisibleIndex >= 0;
                      const bVisible = bVisibleIndex >= 0;
                      if (aVisible && bVisible)
                        return aVisibleIndex - bVisibleIndex;
                      if (aVisible) return -1;
                      if (bVisible) return 1;
                      return allColumns.indexOf(a) - allColumns.indexOf(b);
                    })
                    .map((col) => (
                      <div
                        key={col.key}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-(--wb-surface-hover) transition-colors"
                      >
                        <input
                          type="checkbox"
                          id={`col-${col.key}`}
                          checked={visibleColumnKeys.includes(col.key)}
                          onChange={() => onToggleColumnVisible(col.key)}
                          className="w-4 h-4 rounded border-(--wb-border-default) accent-(--wb-accent) cursor-pointer"
                        />
                        <label
                          htmlFor={`col-${col.key}`}
                          className="flex-1 text-sm font-medium text-(--wb-text-primary) cursor-pointer select-none"
                        >
                          {col.label}
                        </label>
                        <div className="flex bg-(--wb-surface-active) rounded-md p-0.5 border border-(--wb-border-subtle)">
                          <button
                            onClick={() => onMoveColumn(col.key, -1)}
                            className="w-6 h-6 flex items-center justify-center text-(--wb-text-tertiary) hover:text-(--wb-text-primary) hover:bg-(--wb-surface-hover) rounded transition-colors"
                            title="Move left"
                          >
                            ←
                          </button>
                          <div className="w-px h-3 bg-(--wb-border-subtle) self-center" />
                          <button
                            onClick={() => onMoveColumn(col.key, 1)}
                            className="w-6 h-6 flex items-center justify-center text-(--wb-text-tertiary) hover:text-(--wb-text-primary) hover:bg-(--wb-surface-hover) rounded transition-colors"
                            title="Move right"
                          >
                            →
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </div>
  );
}
