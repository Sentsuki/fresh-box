import { useCallback, useState } from "react";
import {
  WrenchRegular,
  InfoRegular,
  WeatherMoonRegular,
  FolderOpenRegular,
  ArrowClockwiseRegular,
  ArrowSyncRegular,
  DocumentTextRegular,
  OpenRegular,
} from "@fluentui/react-icons";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSingboxStore } from "../../stores/singboxStore";
import { useSingbox } from "../../hooks/useSingbox";
import { useCoreUpdate } from "../../hooks/useCoreUpdate";
import { Button } from "../../components/ui/Button";
import { Section } from "../../components/ui/Section";
import { Card } from "../../components/ui/Card";
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
    <div className="flex flex-col gap-8 pb-10">
      <header>
        <h1 className="text-3xl font-bold text-(--wb-text-primary) tracking-tight">Settings</h1>
        <p className="text-sm text-(--wb-text-secondary) mt-1">
          Configure application preferences and core management.
        </p>
      </header>

      {/* Appearance */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-(--wb-text-tertiary) uppercase tracking-wider ml-1">Appearance</h3>
        <Card className="p-0 overflow-hidden divide-y divide-(--wb-border-subtle)">
          <SettingExpander
            icon={<WeatherMoonRegular />}
            label="Application Theme"
            description="Choose your preferred color theme for the interface."
          >
            <select
              value={currentThemeMode}
              onChange={(e) => void setThemeMode(e.target.value as ThemeMode)}
              className="px-3 py-1.5 text-sm rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-layer-alt) text-(--wb-text-primary) outline-none focus:border-(--wb-accent) transition-all"
            >
              <option value="system">System Default</option>
              <option value="dark">Dark Mode</option>
              <option value="light">Light Mode</option>
            </select>
          </SettingExpander>
        </Card>
      </section>

      {/* Core Management */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-(--wb-text-tertiary) uppercase tracking-wider ml-1">Core & Service</h3>
        <Card className="p-0 overflow-hidden divide-y divide-(--wb-border-subtle)">
          <SettingExpander
            icon={<WrenchRegular />}
            label="Service Control"
            description={isRunning ? "The sing-box service is currently active." : "The sing-box service is currently stopped."}
          >
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isRunning ? "bg-(--wb-success) animate-pulse" : "bg-(--wb-text-disabled)"}`} />
              <Button
                variant={isRunning ? "default" : "accent"}
                size="sm"
                onClick={isRunning ? stopService : startService}
                className="min-w-[80px]"
              >
                {isRunning ? "Stop" : "Start"}
              </Button>
            </div>
          </SettingExpander>

          <SettingExpander
            icon={<ArrowSyncRegular />}
            label="Core Version"
            description={`Current: ${currentCoreLabel || "Unknown"}`}
          >
            <div className="flex items-center gap-2">
              {availableOptions.length > 0 && (
                <select
                  value={selectedCoreOptionKey}
                  onChange={(e) => void setSelectedCoreOptionKey(e.target.value)}
                  className="px-3 py-1.5 text-sm rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-layer-alt) text-(--wb-text-primary) outline-none focus:border-(--wb-accent)"
                >
                  {availableOptions.map((opt) => (
                    <option key={`${opt.channel}:${opt.version}`} value={`${opt.channel}:${opt.version}`}>
                      {opt.label}{opt.installed ? (opt.is_active ? " (active)" : " (installed)") : ""}
                    </option>
                  ))}
                </select>
              )}
              <Button
                variant="subtle"
                size="sm"
                icon={<ArrowClockwiseRegular />}
                disabled={isRefreshingCoreStatus}
                onClick={() => void refreshCoreStatus(true, true)}
              />
              <Button
                variant="accent"
                size="sm"
                disabled={isUpdatingCore || !availableOptions.length}
                onClick={() => void applySelectedCore()}
              >
                {isUpdatingCore ? "Updating..." : "Update"}
              </Button>
            </div>
          </SettingExpander>

          {coreUpdateProgress && (
            <div className="px-5 py-3 bg-(--wb-surface-layer-alt)/50">
               <div className="flex justify-between text-xs font-medium text-(--wb-text-secondary) mb-2">
                <span>{coreUpdateProgress.message}</span>
                <span>{coreUpdateProgress.percent}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-(--wb-border-subtle) overflow-hidden">
                <div
                  className="h-full bg-(--wb-accent) transition-all duration-300"
                  style={{ width: `${coreUpdateProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          <SettingExpander
            icon={<InfoRegular />}
            label="Process Status"
            description={processStatus || "Check the real-time state of the sing-box process."}
          >
            <Button
              variant="subtle"
              size="sm"
              icon={<ArrowClockwiseRegular />}
              disabled={isRefreshingStatus}
              onClick={() => void refreshProcessStatus()}
            >
              Refresh
            </Button>
          </SettingExpander>
        </Card>
      </section>

      {/* Advanced */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-(--wb-text-tertiary) uppercase tracking-wider ml-1">Advanced</h3>
        <Card className="p-0 overflow-hidden divide-y divide-(--wb-border-subtle)">
          <SettingExpander
            icon={<DocumentTextRegular />}
            label="Log Level"
            description="Adjust the verbosity of the service logs."
          >
            <select
              value={currentLogLevel}
              onChange={(e) => void setLogLevel(e.target.value as LogLevel)}
              className="px-3 py-1.5 text-sm rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-layer-alt) text-(--wb-text-primary) outline-none focus:border-(--wb-accent)"
            >
              {(["trace", "debug", "info", "warn", "error"] as LogLevel[]).map((level) => (
                <option key={level} value={level}>
                  {level.toUpperCase()}
                </option>
              ))}
            </select>
          </SettingExpander>

          <SettingExpander
            icon={<FolderOpenRegular />}
            label="Data Directory"
            description="Open the folder where configurations and logs are stored."
          >
            <Button
              variant="subtle"
              size="sm"
              icon={<OpenRegular />}
              onClick={() => void openAppDirectory()}
            >
              Open Folder
            </Button>
          </SettingExpander>
        </Card>
      </section>

      {/* About */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-(--wb-text-tertiary) uppercase tracking-wider ml-1">About</h3>
        <Card className="p-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-(--wb-accent) flex items-center justify-center text-2xl text-(--wb-accent-fg) shadow-lg">
                FB
              </div>
              <div>
                <h2 className="text-lg font-bold text-(--wb-text-primary)">Fresh Box</h2>
                <p className="text-xs text-(--wb-text-tertiary)">Version 1.5.2 · Stable Channel</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-2">
              <KeyValue label="Engine" value="sing-box" />
              <KeyValue label="Framework" value="Tauri + React" />
              <KeyValue label="UI Library" value="Fluent UI v9" />
              <KeyValue label="Styling" value="Tailwind v4" />
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

function SettingExpander({
  icon,
  label,
  description,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4 hover:bg-(--wb-surface-hover)/30 transition-colors">
      <div className="flex items-start gap-4 flex-1 min-w-0">
        {icon && <div className="text-lg text-(--wb-text-secondary) mt-0.5">{icon}</div>}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-(--wb-text-primary)">{label}</p>
          {description && (
            <p className="text-xs text-(--wb-text-tertiary) mt-0.5 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

