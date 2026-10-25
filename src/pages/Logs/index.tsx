import { ArrowDownloadRegular, DismissRegular } from "@fluentui/react-icons";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";
import { Button } from "../../components/ui/Button";
import { FloatingPauseButton } from "../../components/ui/FloatingPauseButton";
import { PageHeader } from "../../components/ui/PageHeader";
import { SearchBox } from "../../components/ui/SearchBox";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { useDeferredMount } from "../../hooks/useDeferredMount";
import { useLogsStream } from "../../hooks/useLogsStream";
import { isLogLevel, LOG_LEVELS, type LogLevel } from "../../types/app";

const LEVEL_COLORS: Record<LogLevel, string> = {
  panic: "text-(--wb-log-panic)",
  fatal: "text-(--wb-log-fatal)",
  error: "text-(--wb-log-error)",
  warn: "text-(--wb-log-warn)",
  info: "text-(--wb-log-info)",
  debug: "text-(--wb-log-debug)",
  trace: "text-(--wb-log-trace)",
};

// 按钮从最严重排到最详细。
const LEVEL_OPTIONS = [...LOG_LEVELS].reverse().map((level) => ({
  value: level,
  label: level,
}));

export default function Logs() {
  const {
    visibleLogs,
    isPaused,
    search,
    typeFilter,
    streamStatus,
    setSearch,
    setTypeFilter,
    setIsPaused,
    clearLogs,
    downloadLogs,
    startStream,
  } = useLogsStream();
  const listRef = useRef<HTMLDivElement>(null);

  const isReady = useDeferredMount();

  const rowVirtualizer = useVirtualizer({
    count: visibleLogs.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 30,
    overscan: 8,
  });

  // `useDaemonConnectionListener`/`useWindowVisibilityListener` (registered
  // once at the App root) are what actually own this stream's lifecycle —
  // they start/stop it based on whether sing-box is running and the window
  // is visible, regardless of which page is mounted. This call is just a
  // defensive, idempotent catch-up (see `createStreamGuard`) in case this
  // page is opened before those have caught up; it's never followed by a
  // matching `stopStream()` on unmount on purpose, since navigating away
  // from Logs shouldn't stop a stream those listeners still want running.
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
            <Button
              icon={<DismissRegular />}
              variant="subtle"
              onClick={clearLogs}
            >
              Clear
            </Button>
          </div>
        </PageHeader>
      </div>

      <div className="flex flex-col gap-4 h-full min-h-0 pr-2 pb-10">
        <div className="flex items-center gap-3 flex-wrap">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search logs..."
            className="w-64"
          />

          <div className="flex-1" />

          <SegmentedControl
            value={isLogLevel(typeFilter) ? typeFilter : ""}
            onValueChange={setTypeFilter}
            options={LEVEL_OPTIONS}
            allowEmpty
            className="gap-1.5 p-1"
            itemClassName="px-3 py-1 text-xs font-semibold uppercase tracking-wider"
          />
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
          ) : !isReady ? null : (
            <div
              ref={listRef}
              className="h-full w-full overflow-auto custom-scrollbar animate-pop-in"
            >
              <div
                style={{
                  minWidth: "100%",
                  display: "inline-block",
                }}
              >
                <div
                  style={{
                    height:
                      rowVirtualizer.getVirtualItems().length > 0
                        ? rowVirtualizer.getVirtualItems()[0].start
                        : 0,
                  }}
                />
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const entry = visibleLogs[virtualRow.index];
                  return (
                    <div
                      key={entry.seq}
                      className={[
                        "py-1 px-2 hover:bg-(--wb-surface-hover) rounded group transition-colors",
                        LEVEL_COLORS[entry.type],
                        virtualRow.index % 2 === 0
                          ? "bg-(--wb-surface-active)"
                          : "",
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
                <div
                  style={{
                    height:
                      rowVirtualizer.getVirtualItems().length > 0
                        ? rowVirtualizer.getTotalSize() -
                          rowVirtualizer.getVirtualItems()[
                            rowVirtualizer.getVirtualItems().length - 1
                          ].end
                        : 0,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {streamStatus !== "disabled" && (
          <FloatingPauseButton
            paused={isPaused}
            onToggle={() => setIsPaused(!isPaused)}
          />
        )}
      </div>
    </div>
  );
}
