import {
  ArrowDownloadRegular,
  DismissRegular,
  PauseRegular,
  PlayRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/ui/PageHeader";
import { useLogsStream } from "../../hooks/useLogsStream";

const LEVEL_COLORS: Record<string, string> = {
  panic: "text-(--wb-log-panic)",
  fatal: "text-(--wb-log-fatal)",
  error: "text-(--wb-log-error)",
  warn: "text-(--wb-log-warn)",
  warning: "text-(--wb-log-warn)",
  info: "text-(--wb-log-info)",
  debug: "text-(--wb-log-debug)",
  trace: "text-(--wb-log-trace)",
};

const LOG_LEVELS = [
  "panic",
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
] as const;

export default function Logs() {
  const {
    visibleLogs,
    isPaused,
    search,
    typeFilter,
    logLevel,
    logLevels,
    streamStatus,
    setSearch,
    setTypeFilter,
    setIsPaused,
    setLogLevel,
    clearLogs,
    downloadLogs,
    startStream,
    restartStream,
  } = useLogsStream();
  const listRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: visibleLogs.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 30,
    overscan: 8,
  });

  useEffect(() => {
    startStream();
  }, [startStream]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 pr-2">
        <PageHeader
          title="Logs"
          description="Real-time core diagnostic output and connection events."
        >
          <div className="flex items-center gap-2">
            <Button
              icon={<ArrowDownloadRegular />}
              variant="subtle"
              onClick={downloadLogs}
            >
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
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search logs..."
              className="flex-1 bg-transparent text-sm outline-none text-(--wb-text-primary) placeholder:text-(--wb-text-disabled)"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-(--wb-text-secondary)">
              Stream Level:
            </span>
            <select
              value={logLevel}
              onChange={(event) => {
                void setLogLevel(event.target.value as typeof logLevel).then(() => {
                  restartStream();
                });
              }}
              disabled={streamStatus === "disabled"}
              className="px-3 py-1.5 text-sm rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-layer) text-(--wb-text-primary) outline-none focus:border-(--wb-accent) disabled:opacity-40 disabled:cursor-not-allowed"
              title="Stream log level"
            >
              {logLevels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
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

        <div className="flex-1 min-h-0 rounded-xl border border-(--wb-border-subtle) bg-(--wb-log-bg) shadow-inner p-3 font-mono">
          {streamStatus === "disabled" ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-(--wb-text-disabled) text-sm font-medium">
              <span>Log output is disabled in the core configuration.</span>
              <span className="text-xs text-(--wb-text-disabled) opacity-60">
                Enable it in Settings → Core Log Level.
              </span>
            </div>
          ) : visibleLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-(--wb-text-disabled) text-sm font-medium">
              No logs available
            </div>
          ) : (
            <div ref={listRef} className="h-full w-full overflow-auto custom-scrollbar">
              <div
                style={{
                  minWidth: "100%",
                  display: "inline-block",
                }}
              >
                <div style={{ height: rowVirtualizer.getVirtualItems().length > 0 ? rowVirtualizer.getVirtualItems()[0].start : 0 }} />
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const entry = visibleLogs[virtualRow.index];
                  return (
                    <div
                      key={entry.seq}
                      className={[
                        "py-1 px-2 hover:bg-(--wb-surface-hover) rounded group transition-colors",
                        LEVEL_COLORS[entry.type] ?? "text-(--wb-text-primary)",
                        virtualRow.index % 2 === 0 ? "bg-(--wb-surface-active)" : "",
                      ].join(" ")}
                      style={{ height: 30 }}
                    >
                      <div className="flex items-start gap-3">
                        <span className="shrink-0 text-(--wb-text-disabled) font-semibold w-12 text-right tracking-wider">
                          {entry.type.toUpperCase().slice(0, 5)}
                        </span>
                        {entry.time && (
                          <span className="shrink-0 text-(--wb-text-tertiary) w-20">
                            {entry.time}
                          </span>
                        )}
                        <span
                          className="flex-1 whitespace-pre text-[13px] leading-5"
                          title={entry.payload}
                        >
                          {entry.payload}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div style={{ height: rowVirtualizer.getVirtualItems().length > 0 ? rowVirtualizer.getTotalSize() - rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1].end : 0 }} />
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => setIsPaused(!isPaused)}
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
          {isPaused ? <PlayRegular className="w-5 h-5" /> : <PauseRegular className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}
