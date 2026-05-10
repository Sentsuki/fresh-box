import {
  ColumnRegular,
  DismissRegular,
  PauseRegular,
  PlayRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import { Button } from "../../components/ui/Button";
import { allColumns } from "../../hooks/useConnectionsStream";
import type {
  ConnectionColumnKey,
  ConnectionPageTab,
  SortDirection,
} from "../../types/app";

interface ConnectionCtrlProps {
  currentTab: ConnectionPageTab;
  groupedColumnLabel: string | null;
  search: string;
  regexFilter: string;
  regexEnabled: boolean;
  regexInvalid: boolean;
  sourceIpFilter: string;
  sourceIpOptions: string[];
  isPaused: boolean;
  showColumns: boolean;
  visibleColumnKeys: ConnectionColumnKey[];
  columnOrder: ConnectionColumnKey[];
  sortKey: ConnectionColumnKey;
  sortDirection: SortDirection;
  onSetTab: (tab: ConnectionPageTab) => void;
  onSearchChange: (value: string) => void;
  onRegexFilterChange: (value: string) => void;
  onRegexEnabledChange: (enabled: boolean) => void;
  onSourceIpFilterChange: (value: string) => void;
  onTogglePause: () => void;
  onToggleColumnsPanel: () => void;
  onToggleColumnVisible: (key: ConnectionColumnKey) => void;
  onMoveColumn: (key: ConnectionColumnKey, dir: -1 | 1) => void;
  onSortDirectionToggle: () => void;
  onClearGrouping: () => void;
  onCloseAll: () => void;
}

export function ConnectionCtrl({
  currentTab,
  groupedColumnLabel,
  search,
  regexFilter,
  regexEnabled,
  regexInvalid,
  sourceIpFilter,
  sourceIpOptions,
  isPaused,
  showColumns,
  visibleColumnKeys,
  columnOrder,
  sortDirection,
  onSetTab,
  onSearchChange,
  onRegexFilterChange,
  onRegexEnabledChange,
  onSourceIpFilterChange,
  onTogglePause,
  onToggleColumnsPanel,
  onToggleColumnVisible,
  onMoveColumn,
  onSortDirectionToggle,
  onClearGrouping,
  onCloseAll,
}: ConnectionCtrlProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex rounded-(--wb-radius-md) border border-(--wb-border-subtle) overflow-hidden winui-segmented-control p-0.5 bg-(--wb-surface-layer)">
        {(["active", "closed"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => onSetTab(tab)}
            className={[
              "px-4 py-1.5 text-sm font-medium capitalize transition-colors rounded",
              currentTab === tab
                ? "bg-(--wb-surface-hover) text-(--wb-text-primary)"
                : "text-(--wb-text-secondary) hover:text-(--wb-text-primary)",
            ].join(" ")}
          >
            {tab}
          </button>
        ))}
      </div>

      {groupedColumnLabel && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide uppercase bg-(--wb-accent)/10 text-(--wb-accent) border border-(--wb-accent)/20">
          <span>Grouped: {groupedColumnLabel}</span>
          <button
            onClick={onClearGrouping}
            className="hover:opacity-70 transition-opacity leading-none ml-1"
            title="Clear grouping"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex-1" />

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

      <div
        className={[
          "flex items-center gap-2 px-3 py-1.5 rounded-(--wb-radius-md) border bg-(--wb-surface-layer) min-w-72",
          regexInvalid
            ? "border-(--wb-error)"
            : "border-(--wb-border-default)",
        ].join(" ")}
      >
        <input
          checked={regexEnabled}
          onChange={(e) => onRegexEnabledChange(e.target.checked)}
          type="checkbox"
          title="Enable regex filter"
          className="w-4 h-4 rounded border-(--wb-border-default) accent-(--wb-accent) cursor-pointer"
        />
        <input
          value={regexFilter}
          onChange={(e) => onRegexFilterChange(e.target.value)}
          placeholder="Regex filter..."
          className="flex-1 bg-transparent text-sm outline-none text-(--wb-text-primary) placeholder:text-(--wb-text-disabled)"
        />
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-layer)">
        <span className="text-xs font-semibold uppercase tracking-wide text-(--wb-text-tertiary)">
          Source IP
        </span>
        <select
          value={sourceIpFilter}
          onChange={(e) => onSourceIpFilterChange(e.target.value)}
          className="bg-transparent text-sm outline-none text-(--wb-text-primary)"
        >
          <option value="all">All</option>
          {sourceIpOptions.map((sourceIp) => (
            <option key={sourceIp} value={sourceIp}>
              {sourceIp}
            </option>
          ))}
        </select>
      </div>

      <Button
        icon={sortDirection === "asc" ? "↑" : "↓"}
        variant="subtle"
        onClick={onSortDirectionToggle}
      >
        Sort
      </Button>

      <Button
        icon={isPaused ? <PlayRegular /> : <PauseRegular />}
        variant="subtle"
        onClick={onTogglePause}
      >
        {isPaused ? "Resume" : "Pause"}
      </Button>

      <div className="relative">
        <Button
          icon={<ColumnRegular />}
          variant="subtle"
          onClick={onToggleColumnsPanel}
        >
          Columns
        </Button>
        {showColumns && (
          <div className="absolute right-0 top-full mt-2 z-50 min-w-64 rounded-xl border border-(--wb-border-default) bg-(--wb-surface-flyout) backdrop-blur-xl p-2 flex flex-col gap-0.5">
            <div className="px-3 py-2 text-xs font-semibold text-(--wb-text-tertiary) uppercase tracking-wider">
              Visible Columns
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-1">
              {allColumns
                .slice()
                .sort(
                  (a, b) =>
                    columnOrder.indexOf(a.key) - columnOrder.indexOf(b.key),
                )
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
          </div>
        )}
      </div>

      <Button icon={<DismissRegular />} variant="subtle" onClick={onCloseAll}>
        Close All
      </Button>
    </div>
  );
}
