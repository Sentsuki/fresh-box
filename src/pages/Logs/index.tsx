import { useEffect, useCallback } from "react";
import {
  PlayRegular,
  PauseRegular,
  DismissRegular,
  ArrowDownloadRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import { useLogsStream } from "../../hooks/useLogsStream";
import { Button } from "../../components/ui/Button";
import { VirtualList } from "../../components/ui/VirtualList";
import type { LogEntry } from "../../types/app";

const LEVEL_COLORS: Record<string, string> = {
  error: "text-(--wb-error)",
  warn: "text-(--wb-warning)",
  warning: "text-(--wb-warning)",
  info: "text-(--wb-text-primary)",
  debug: "text-(--wb-text-tertiary)",
  trace: "text-(--wb-text-disabled)",
};

const LOG_LEVELS = ["error", "warn", "info", "debug", "trace"] as const;

export default function Logs() {
  const {
    visibleLogs,
    isPaused,
    search,
    typeFilter,
    logLevel,
    logLevels,
    setSearch,
    setTypeFilter,
    setIsPaused,
    setLogLevel,
    clearLogs,
    downloadLogs,
    startStream,
    stopStream,
    restartStream,
  } = useLogsStream();

  useEffect(() => {
    startStream();
    return () => stopStream(false);
  }, [startStream, stopStream]);

  const renderLogEntry = useCallback(
    (entry: LogEntry, _i: number) => (
      <div
        className={[
          "flex items-start gap-3 py-1 px-3 hover:bg-(--wb-surface-hover) rounded-(--wb-radius-sm) transition-colors font-mono text-[11px] leading-5",
          LEVEL_COLORS[entry.type] ?? "text-(--wb-text-primary)",
        ].join(" ")}
      >
        <span className="shrink-0 text-(--wb-text-disabled) w-12 text-center bg-(--wb-surface-active) rounded-[2px] font-bold text-[9px] h-4 mt-0.5 leading-4">
          {entry.type.toUpperCase().slice(0, 4)}
        </span>
        {entry.time && (
          <span className="shrink-0 text-(--wb-text-tertiary) w-24">
            {entry.time}
          </span>
        )}
        <span className="flex-1 min-w-0 break-all">
          {entry.payload}
        </span>
      </div>
    ),
    [],
  );

  return (
    <div className="flex flex-col h-full gap-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-(--wb-text-primary) tracking-tight">Logs</h1>
          <p className="text-sm text-(--wb-text-secondary) mt-1">
            Real-time monitoring of service activities.
          </p>
        </div>

        <div className="flex items-center gap-2">
           <select
            value={logLevel}
            onChange={(e) => {
              void setLogLevel(e.target.value as typeof logLevel).then(() => {
                restartStream();
              });
            }}
            className="px-3 py-1.5 text-xs font-medium rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-layer) text-(--wb-text-primary) outline-none focus:border-(--wb-accent)"
            title="Stream log level"
          >
            {logLevels.map((l) => (
              <option key={l} value={l}>{l.toUpperCase()}</option>
            ))}
          </select>

          <Button
            variant="default"
            size="md"
            icon={isPaused ? <PlayRegular /> : <PauseRegular />}
            onClick={() => setIsPaused(!isPaused)}
            title={isPaused ? "Resume" : "Pause"}
          >
            {isPaused ? "Resume" : "Pause"}
          </Button>
          <Button
            variant="subtle"
            size="md"
            icon={<DismissRegular />}
            onClick={clearLogs}
            title="Clear logs"
          />
          <Button
            variant="subtle"
            size="md"
            icon={<ArrowDownloadRegular />}
            onClick={downloadLogs}
            title="Download logs"
          />
        </div>
      </header>

      {/* Controls & Filter */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <SearchRegular className="absolute left-3 top-1/2 -translate-y-1/2 text-base text-(--wb-text-tertiary)" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter logs by keyword..."
            className="w-full bg-(--wb-surface-layer) border border-(--wb-border-subtle) rounded-(--wb-radius-md) pl-10 pr-4 py-2 text-sm text-(--wb-text-primary) placeholder:text-(--wb-text-disabled) outline-none focus:border-(--wb-accent) transition-all"
          />
        </div>

        <div className="flex items-center gap-1 bg-(--wb-surface-layer) p-1 rounded-(--wb-radius-md) border border-(--wb-border-subtle)">
          <button
            onClick={() => setTypeFilter(null)}
            className={`px-3 py-1 text-xs font-semibold rounded-(--wb-radius-sm) transition-all ${
              typeFilter === null ? "bg-(--wb-accent) text-(--wb-accent-fg) shadow-sm" : "text-(--wb-text-secondary) hover:bg-(--wb-surface-hover)"
            }`}
          >
            ALL
          </button>
          {LOG_LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => setTypeFilter(level)}
              className={`px-3 py-1 text-xs font-semibold rounded-(--wb-radius-sm) transition-all uppercase ${
                typeFilter === level ? "bg-(--wb-accent) text-(--wb-accent-fg) shadow-sm" : "text-(--wb-text-secondary) hover:bg-(--wb-surface-hover)"
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-(--wb-surface-layer-alt)/30 rounded-(--wb-radius-lg) border border-(--wb-border-subtle) overflow-hidden p-2">
        <VirtualList
          items={visibleLogs}
          renderItem={renderLogEntry}
          itemHeight={28}
          className="h-full scroll-smooth"
        />
      </div>
    </div>
  );
}

          {LOG_LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => setTypeFilter(typeFilter === level ? "" : level)}
              className={[
                "px-2 py-0.5 text-xs rounded border transition-colors",
                typeFilter === level
                  ? "border-(--wb-accent) bg-(--wb-accent) text-(--wb-accent-fg)"
                  : "border-(--wb-border-subtle) text-(--wb-text-secondary) hover:border-(--wb-border-default)",
              ].join(" ")}
            >
              {level}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-layer) min-w-40">
          <SearchRegular className="text-(--wb-text-tertiary) text-sm" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent text-sm outline-none text-(--wb-text-primary) placeholder:text-(--wb-text-disabled) w-28"
          />
        </div>

        <Button
          icon={isPaused ? <PlayRegular /> : <PauseRegular />}
          variant="subtle"
          onClick={() => setIsPaused(!isPaused)}
        >
          {isPaused ? "Resume" : "Pause"}
        </Button>
        <Button icon={<ArrowDownloadRegular />} variant="subtle" onClick={downloadLogs}>
          Export
        </Button>
        <Button icon={<DismissRegular />} variant="subtle" onClick={clearLogs}>
          Clear
        </Button>
      </div>

      {/* Log list — virtualized */}
      <div className="flex-1 min-h-0 rounded-(--wb-radius-lg) border border-(--wb-border-subtle) bg-(--wb-surface-layer) p-2 font-mono text-xs">
        {visibleLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-(--wb-text-disabled)">
            No logs
          </div>
        ) : (
          <VirtualList
            items={visibleLogs}
            itemHeight={20}
            getItemKey={(entry, i) => entry.seq ?? i}
            renderItem={renderLogEntry}
            autoScrollToEnd
          />
        )}
      </div>
    </div>
  );
}
