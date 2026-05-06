import { useEffect, useMemo } from "react";
import {
  Text,
  Badge,
  Select,
  Input,
  Button,
  Card,
} from "@fluentui/react-components";
import {
  ArrowDownloadRegular,
  PlayRegular,
  PauseRegular,
  DismissRegular,
} from "@fluentui/react-icons";
import { useLogsStream } from "../hooks/useLogsStream";
import { useAppStore } from "../stores/appStore";
import type { LogLevel } from "../types/app";

function getLogBadgeColor(type: string): "subtle" | "brand" | "informative" | "warning" | "danger" {
  switch (type.toLowerCase()) {
    case "trace":
      return "subtle";
    case "debug":
      return "brand";
    case "info":
      return "informative";
    case "warn":
    case "warning":
      return "warning";
    case "error":
    case "fatal":
    case "panic":
      return "danger";
    default:
      return "subtle";
  }
}

export default function Logs() {
  const isRunning = useAppStore((state) => state.isRunning);
  const logs = useLogsStream();

  const statusLabel = useMemo(() => {
    if (!isRunning) return "Service stopped";
    if (logs.streamStatus === "connected") return "Streaming";
    if (logs.streamStatus === "connecting") return "Connecting";
    if (logs.streamStatus === "error") return "Error";
    return "Disconnected";
  }, [isRunning, logs.streamStatus]);

  const statusBadgeColor = useMemo(() => {
    if (statusLabel === "Streaming") return "success";
    if (statusLabel === "Connecting") return "warning";
    if (statusLabel === "Error") return "danger";
    return "subtle";
  }, [statusLabel]);

  useEffect(() => {
    if (isRunning) {
      logs.startStream();
    } else {
      logs.stopStream(true);
    }
    return () => {
      logs.stopStream(false);
    };
  }, [isRunning, logs.startStream, logs.stopStream]);

  useEffect(() => {
    if (isRunning) {
      logs.restartStream();
    }
  }, [isRunning, logs.logLevel, logs.restartStream]);

  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden pb-4">
      <div className="flex items-center justify-between">
        <Text size={600} weight="semibold">Logs</Text>
        <Badge color={statusBadgeColor} appearance="filled">
          {statusLabel}
        </Badge>
      </div>

      <div className="flex flex-col gap-4 h-full min-h-0">
        {!isRunning ? (
          <Card className="flex items-center justify-center h-48 border-dashed border-neutral-700 bg-transparent shrink-0">
            <Text className="text-neutral-400">
              Start sing-box first, then open Logs to inspect the live core output.
            </Text>
          </Card>
        ) : (
          <>
            <Card className="p-3 bg-neutral-800 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <Select
                    value={logs.logLevel}
                    onChange={(_, data) => logs.setLogLevel(data.value as LogLevel)}
                  >
                    {logs.logLevels.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </Select>

                  <Select
                    value={logs.typeFilter}
                    onChange={(_, data) => logs.setTypeFilter(data.value)}
                  >
                    <option value="">All categories</option>
                    {logs.availableTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </Select>

                  <Input
                    value={logs.search}
                    onChange={(_, data) => logs.setSearch(data.value)}
                    placeholder="Search time / level / category / payload"
                    className="min-w-48 flex-1"
                  />
                </div>

                <div className="flex items-center gap-1 pr-1">
                  <Button
                    appearance="subtle"
                    icon={<ArrowDownloadRegular />}
                    onClick={logs.downloadLogs}
                    title="Export"
                  />
                  <Button
                    appearance="subtle"
                    icon={logs.isPaused ? <PlayRegular /> : <PauseRegular />}
                    onClick={() => logs.setIsPaused(!logs.isPaused)}
                    title={logs.isPaused ? "Resume" : "Pause"}
                  />
                  <Button
                    appearance="subtle"
                    icon={<DismissRegular />}
                    onClick={logs.clearLogs}
                    title="Clear"
                  />
                </div>
              </div>
            </Card>

            {logs.streamError && (
              <Card className="border-red-900/50 bg-red-900/10 shrink-0">
                <Text className="text-red-400">{logs.streamError}</Text>
              </Card>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-800 shadow-sm">
              {logs.visibleLogs.map((entry) => (
                <div
                  key={entry.seq}
                  className="border-b border-neutral-700/50 px-4 py-2 transition-colors hover:bg-neutral-700/30 flex flex-col gap-1 text-[13px]"
                >
                  <div className="flex items-center gap-2">
                    <Text className="text-neutral-500 opacity-70 min-w-[2.5rem] font-mono">
                      {entry.seq.toString().padStart(4, "0")}
                    </Text>
                    <Badge color={getLogBadgeColor(entry.type)} shape="rounded" appearance="outline">
                      {entry.type.toUpperCase()}
                    </Badge>
                    <Badge appearance="tint" color="subtle" shape="rounded">
                      {entry.category}
                    </Badge>
                    <div className="flex-1"></div>
                    <Text className="text-neutral-500 opacity-80 font-mono text-[11px]">
                      {entry.time}
                    </Text>
                  </div>
                  <div className="whitespace-pre-wrap break-words leading-relaxed text-neutral-300 font-mono pl-[3.25rem]">
                    {entry.payload}
                  </div>
                </div>
              ))}

              {logs.visibleLogs.length === 0 && (
                <div className="flex h-48 items-center justify-center px-6 text-center">
                  <Text className="text-neutral-500">No logs matched the current filters.</Text>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
