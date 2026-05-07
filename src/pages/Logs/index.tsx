import {
  ArrowDownloadRegular,
  DismissRegular,
  PauseRegular,
  PlayRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import { useCallback, useEffect } from "react";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/ui/PageHeader";
import { VirtualList } from "../../components/ui/VirtualList";
import { useLogsStream } from "../../hooks/useLogsStream";
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
    return () => stopStream(true);
  }, [startStream, stopStream]);

  const renderLogEntry = useCallback(
    (entry: LogEntry, _i: number) => (
      <div
        className={[
          "flex items-start gap-3 py-1 px-2 hover:bg-[rgba(255,255,255,0.03)] rounded group transition-colors",
          LEVEL_COLORS[entry.type] ?? "text-(--wb-text-primary)",
        ].join(" ")}
        style={{ height: 28, lineHeight: "20px" }}
      >
        <span className="shrink-0-(--wb-text-disabled) font-semibold w-12 text-right tracking-wider">
          {entry.type.toUpperCase().slice(0, 5)}
        </span>
        {entry.time && (
          <span className="shrink-0 text-(--wb-text-tertiary) w-20">
            {entry.time}
          </span>
        )}
        <span className="flex-1 min-w-0 truncate text-[13px]">
          {entry.payload}
        </span>
      </div>
    ),
    [],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 pr-2">
        <PageHeader
          title="Logs"
          description="Real-time core diagnostic output and connection events."
        >
          <div className="flex items-center gap-2">
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
        </PageHeader>
      </div>

      <div className="flex flex-col gap-4 h-full min-h-0 pr-2 pb-10">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-layer) w-64">
            <SearchRegular className="text-(--wb-text-tertiary) text-sm" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search logs..."
              className="flex-1 bg-transparent text-sm outline-none text-(--wb-text-primary) placeholder:text-(--wb-text-disabled)"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-(--wb-text-secondary)">Stream Level:</span>
            <select
              value={logLevel}
              onChange={(e) => {
                void setLogLevel(e.target.value as typeof logLevel).then(() => {
                  restartStream();
                });
              }}
              className="px-3 py-1.5 text-sm rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-layer) text-(--wb-text-primary) outline-none focus:border-(--wb-accent)"
              title="Stream log level"
            >
              {logLevels.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          <div className="flex-1" />

          <div className="flex gap-1.5 bg-(--wb-surface-layer) p-1 rounded-(--wb-radius-md) border border-(--wb-border-subtle) winui-segmented-control">
            {LOG_LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => setTypeFilter(typeFilter === level ? "" : level)}
                className={[
                  "px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded transition-colors",
                  typeFilter === level
                    ? "bg-(--wb-surface-hover) text-(--wb-text-primary)"
                    : "text-(--wb-text-secondary) hover:text-(--wb-text-primary)",
                ].join(" ")}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 rounded-xl border border-(--wb-border-subtle) bg-[rgba(0,0,0,0.2)] shadow-inner p-3 font-mono">
          {visibleLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-(--wb-text-disabled) text-sm font-medium">
              No logs available
            </div>
          ) : (
            <VirtualList
              items={visibleLogs}
              itemHeight={28}
              renderItem={renderLogEntry}
              getItemKey={(item) => item.seq}
              className="h-full w-full custom-scrollbar"
            />
          )}
        </div>
      </div>
    </div>
  );
}
