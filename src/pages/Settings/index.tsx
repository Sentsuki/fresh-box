import { useCallback, useState } from "react";
import {
  WrenchRegular,
  InfoRegular,
  WeatherMoonRegular,
  FolderOpenRegular,
  ArrowClockwiseRegular,
  ArrowSyncRegular,
} from "@fluentui/react-icons";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSingboxStore } from "../../stores/singboxStore";
import { useSingbox } from "../../hooks/useSingbox";
import { useCoreUpdate } from "../../hooks/useCoreUpdate";
import { Button } from "../../components/ui/Button";
import { Section } from "../../components/ui/Section";
import { KeyValue } from "../../components/ui/KeyValue";
import { openAppDirectory, getSingboxStatus } from "../../services/api";
import { getErrorMessage } from "../../services/tauri";
import { useToast } from "../../hooks/useToast";
import type { LogLevel, ThemeMode } from "../../types/app";

export default function Settings() {
  const settings = useSettingsStore((s) => s.settings);
  const setLogLevel = useSettingsStore((s) => s.setLogLevel);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const isRunning = useSingboxStore((s) => s.isRunning);
  const { startService, stopService } = useSingbox();
  const { error: toastError } = useToast();

  const currentLogLevel = settings.pages.logs.log_level;
  const currentThemeMode = settings.theme_mode;

  const [processStatus, setProcessStatus] = useState("");
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);

  const refreshProcessStatus = useCallback(async () => {
    if (isRefreshingStatus) return;
    setIsRefreshingStatus(true);
    try {
      const status = await getSingboxStatus();
      setProcessStatus(status);
    } catch (err) {
      setProcessStatus("Failed to get sing-box status");
      toastError(`Failed to get sing-box status: ${getErrorMessage(err)}`);
    } finally {
      setIsRefreshingStatus(false);
    }
  }, [isRefreshingStatus, toastError]);

  const processStatusColor = (() => {
    if (!processStatus) return "text-[var(--wb-text-secondary)]";
    const n = processStatus.toLowerCase();
    if (n.includes("running") || n.includes("detected")) return "text-[#6BB44A]";
    if (n.includes("failed") || n.includes("error")) return "text-[#E05252]";
    return "text-[var(--wb-accent)]";
  })();

  const {
    isRefreshingCoreStatus,
    isUpdatingCore,
    coreStatus,
    coreStatusError,
    coreUpdateProgress,
    selectedCoreOptionKey,
    setSelectedCoreOptionKey,
    currentCoreLabel,
    coreStatusText,
    updateCoreButtonLabel,
    refreshCoreStatus,
    applySelectedCore,
  } = useCoreUpdate(true);

  const availableOptions = coreStatus?.available_options ?? [];

  return (
    <div className="flex flex-col gap-5 max-w-lg">
      <div>
        <h1 className="text-xl font-semibold text-[var(--wb-text-primary)]">Settings</h1>
        <p className="text-sm text-[var(--wb-text-secondary)] mt-0.5">
          Application and core settings
        </p>
      </div>

      {/* Appearance */}
      <Section title="Appearance" icon={<WeatherMoonRegular />}>
        <div className="flex flex-col gap-4">
          <SettingRow
            label="Theme"
            description="Color theme for the application"
          >
            <select
              value={currentThemeMode}
              onChange={(e) =>
                void setThemeMode(e.target.value as ThemeMode)
              }
              className="px-2 py-1 text-sm rounded-[var(--wb-radius-md)] border border-[var(--wb-border-default)] bg-[var(--wb-surface-layer)] text-[var(--wb-text-primary)] outline-none focus:border-[var(--wb-accent)]"
            >
              <option value="system">Follow system</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </SettingRow>
        </div>
      </Section>

      {/* Sing-box Core Status */}
      <Section
        title="Sing-box Core"
        icon={<WrenchRegular />}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--wb-text-primary)]">Core status</p>
              <p className="text-xs text-[var(--wb-text-secondary)]">
                {isRunning ? "Running" : "Stopped"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={isRunning ? "default" : "accent"}
                size="sm"
                onClick={isRunning ? stopService : startService}
              >
                {isRunning ? "Stop" : "Start"}
              </Button>
            </div>
          </div>
        </div>
      </Section>

      {/* Sing-box Core Version Manager */}
      <Section
        title="Core Version"
        icon={<ArrowSyncRegular />}
        actions={
          <Button
            icon={<ArrowClockwiseRegular />}
            size="sm"
            variant="subtle"
            disabled={isRefreshingCoreStatus}
            onClick={() => void refreshCoreStatus(true, true)}
          >
            {isRefreshingCoreStatus ? "Checking..." : "Refresh"}
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {coreStatusError && (
            <p className="text-xs text-[#E05252]">{coreStatusError}</p>
          )}
          <KeyValue label="Status" value={coreStatusText} />
          <KeyValue label="Current" value={currentCoreLabel} />

          {availableOptions.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-[var(--wb-text-primary)]">Target</p>
                <select
                  value={selectedCoreOptionKey}
                  onChange={(e) => void setSelectedCoreOptionKey(e.target.value)}
                  className="px-2 py-1 text-sm rounded-[var(--wb-radius-md)] border border-[var(--wb-border-default)] bg-[var(--wb-surface-layer)] text-[var(--wb-text-primary)] outline-none focus:border-[var(--wb-accent)]"
                >
                  {availableOptions.map((opt) => (
                    <option key={`${opt.channel}:${opt.version}`} value={`${opt.channel}:${opt.version}`}>
                      {opt.label}{opt.installed ? (opt.is_active ? " ✓ (active)" : " (installed)") : ""}
                    </option>
                  ))}
                </select>
              </div>

              {coreUpdateProgress && (
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs text-[var(--wb-text-secondary)]">
                    <span>{coreUpdateProgress.message}</span>
                    <span>{coreUpdateProgress.percent}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-[var(--wb-border-default)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--wb-accent)] transition-all duration-200"
                      style={{ width: `${coreUpdateProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  variant="accent"
                  size="sm"
                  disabled={isUpdatingCore || !availableOptions.length}
                  onClick={() => void applySelectedCore()}
                >
                  {updateCoreButtonLabel}
                </Button>
              </div>
            </>
          )}
        </div>
      </Section>

      {/* Process Manager */}
      <Section
        title="Process Status"
        actions={
          <Button
            icon={<ArrowClockwiseRegular />}
            size="sm"
            variant="subtle"
            disabled={isRefreshingStatus}
            onClick={() => void refreshProcessStatus()}
          >
            {isRefreshingStatus ? "Checking..." : "Refresh Status"}
          </Button>
        }
      >
        {processStatus ? (
          <p className={`text-sm font-mono ${processStatusColor}`}>{processStatus}</p>
        ) : (
          <p className="text-sm text-[var(--wb-text-secondary)]">
            Click "Refresh Status" to check the sing-box process state.
          </p>
        )}
      </Section>

      {/* Logs settings */}
      <Section title="Logs">
        <div className="flex flex-col gap-4">
          <SettingRow
            label="Log level"
            description="Minimum log level to display"
          >
            <select
              value={currentLogLevel}
              onChange={(e) =>
                void setLogLevel(e.target.value as LogLevel)
              }
              className="px-2 py-1 text-sm rounded-[var(--wb-radius-md)] border border-[var(--wb-border-default)] bg-[var(--wb-surface-layer)] text-[var(--wb-text-primary)] outline-none focus:border-[var(--wb-accent)]"
            >
              {(["trace", "debug", "info", "warn", "error"] as LogLevel[]).map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </SettingRow>
        </div>
      </Section>

      {/* App Directory */}
      <Section title="Application" icon={<FolderOpenRegular />}>
        <Button
          icon={<FolderOpenRegular />}
          variant="subtle"
          onClick={() => void openAppDirectory()}
        >
          Open App Directory
        </Button>
      </Section>

      {/* About */}
      <Section title="About" icon={<InfoRegular />}>
        <div className="flex flex-col gap-1">
          <KeyValue label="App" value="Fresh Box" />
          <KeyValue label="Framework" value="Tauri + React 19" />
          <KeyValue label="UI" value="FluentUI v9 + Tailwind v4" />
        </div>
      </Section>
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--wb-text-primary)]">{label}</p>
        {description && (
          <p className="text-xs text-[var(--wb-text-secondary)] mt-0.5">
            {description}
          </p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}
