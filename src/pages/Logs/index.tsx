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
          "flex items-start gap-2 py-0.5 px-1 hover:bg-[rgba(255,255,255,0.03)] rounded group",
          LEVEL_COLORS[entry.type] ?? "text-(--wb-text-primary)",
        ].join(" ")}
        style={{ height: 20, lineHeight: "20px" }}
      >
        <span className="flex-shrink-0 text-(--wb-text-disabled) w-12 text-right">
          {entry.type.toUpperCase().slice(0, 4)}
        </span>
        {entry.time && (
          <span className="flex-shrink-0 text-(--wb-text-disabled) w-20">
            {entry.time}
          </span>
        )}
        <span className="flex-1 min-w-0 truncate">
          {entry.payload}
        </span>
      </div>
    ),
    [],
  );

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-(--wb-text-primary)">Logs</h1>
        </div>
        <div className="flex-1" />

        {/* Log level (stream level) */}
        <select
          value={logLevel}
          onChange={(e) => {
            void setLogLevel(e.target.value as typeof logLevel).then(() => {
              restartStream();
            });
          }}
          className="px-2 py-1 text-xs rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-layer) text-(--wb-text-primary) outline-none focus:border-(--wb-accent)"
          title="Stream log level"
        >
          {logLevels.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>

        {/* Level/type filter buttons */}
        <div className="flex gap-1">
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
