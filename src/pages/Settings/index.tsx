import { useEffect } from "react";
import {
  WeatherMoonRegular,
  FolderOpenRegular,
  ArrowSyncRegular,
  DocumentTextRegular,
  InfoRegular,
  BoxRegular,
  SettingsRegular,
} from "@fluentui/react-icons";
import { useSettingsStore } from "../../stores/settingsStore";
import { useCoreUpdate } from "../../hooks/useCoreUpdate";
import { usePriorityConfig, STACK_OPTIONS, LOG_LEVELS } from "../../hooks/usePriorityConfig";
import { Button } from "../../components/ui/Button";
import { SettingCard, SettingGroup } from "../../components/ui/SettingCard";
import { PageHeader } from "../../components/ui/PageHeader";
import { Switch } from "../../components/ui/Switch";
import { openAppDirectory } from "../../services/api";
import type { LogLevel as AppLogLevel, ThemeMode } from "../../types/app";

export default function Settings() {
  const settings = useSettingsStore((s) => s.settings);
  const setLogLevel = useSettingsStore((s) => s.setLogLevel);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);

  const currentAppLogLevel = settings.pages.logs.log_level;
  const currentThemeMode = settings.theme_mode;

  // Core Update Manager
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

  // Priority Config (TUN & Core Logs)
  const {
    isLoading: isPriorityLoading,
    hasStackField,
    hasLogField,
    selectedStack,
    logDisabled,
    setLogDisabled,
    selectedLogLevel,
    setSelectedLogLevel,
    loadConfiguration,
    setStackOption,
    updateLogConfiguration,
  } = usePriorityConfig();

  useEffect(() => {
    void loadConfiguration();
  }, [loadConfiguration]);

  return (
    <div className="flex flex-col h-full overflow-y-auto pr-2 pb-10">
      <PageHeader 
        title="Settings" 
        description="Configure application preferences and sing-box core parameters."
      />

      <div className="flex flex-col gap-8">
        
        {/* Appearance */}
        <SettingGroup title="Appearance">
          <SettingCard
            icon={<WeatherMoonRegular />}
            title="App Theme"
            description="Select the color theme for the application"
            control={
              <select
                value={currentThemeMode}
                onChange={(e) => void setThemeMode(e.target.value as ThemeMode)}
                className="px-3 py-1.5 text-sm rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-base) text-(--wb-text-primary) outline-none focus:border-(--wb-accent)"
              >
                <option value="system">Follow System</option>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            }
          />
        </SettingGroup>

        {/* Core Settings */}
        <SettingGroup title="Sing-box Core">
          <SettingCard
            icon={<ArrowSyncRegular />}
            title="Core Version"
            description={
              <div className="flex flex-col gap-1 mt-1">
                <span>{coreStatusText} (Current: {currentCoreLabel})</span>
                {coreStatusError && <span className="text-(--wb-error)">{coreStatusError}</span>}
                {coreUpdateProgress && (
                  <div className="flex flex-col gap-1 w-48 mt-1">
                    <div className="flex justify-between text-[10px] text-(--wb-text-tertiary)">
                      <span>{coreUpdateProgress.message}</span>
                      <span>{coreUpdateProgress.percent}%</span>
                    </div>
                    <div className="h-1 rounded-full bg-(--wb-border-default) overflow-hidden">
                      <div
                        className="h-full bg-(--wb-accent) transition-all duration-200"
                        style={{ width: `${coreUpdateProgress.percent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            }
            control={
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  variant="subtle"
                  icon={<ArrowSyncRegular className={isRefreshingCoreStatus ? "animate-spin" : ""} />}
                  disabled={isRefreshingCoreStatus}
                  onClick={() => void refreshCoreStatus(true, true)}
                >
                  Check
                </Button>

                {availableOptions.length > 0 && (
                  <>
                    <div className="w-px h-4 bg-(--wb-border-subtle) mx-1" />
                    <select
                      value={selectedCoreOptionKey}
                      onChange={(e) => void setSelectedCoreOptionKey(e.target.value)}
                      className="px-3 py-1.5 text-sm rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-base) text-(--wb-text-primary) outline-none focus:border-(--wb-accent)"
                    >
                      {availableOptions.map((opt) => (
                        <option key={`${opt.channel}:${opt.version}`} value={`${opt.channel}:${opt.version}`}>
                          {opt.label}{opt.installed ? (opt.is_active ? " ✓" : "") : ""}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="accent"
                      disabled={isUpdatingCore}
                      onClick={() => void applySelectedCore()}
                    >
                      {updateCoreButtonLabel}
                    </Button>
                  </>
                )}
              </div>
            }
          />

          {!isPriorityLoading && hasStackField && (
            <SettingCard
              icon={<BoxRegular />}
              title="TUN Stack"
              description="Select the network stack for the TUN interface (applied on restart)"
              control={
                <select
                  value={selectedStack}
                  onChange={(e) => void setStackOption(e.target.value as typeof STACK_OPTIONS[number])}
                  className="px-3 py-1.5 text-sm rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-base) text-(--wb-text-primary) outline-none focus:border-(--wb-accent)"
                >
                  {STACK_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              }
            />
          )}

          {!isPriorityLoading && hasLogField && (
            <SettingCard
              icon={<DocumentTextRegular />}
              title="Core Log Level"
              description="Log output detail from the sing-box core"
              control={
                <div className="flex items-center gap-3">
                  <select
                    value={selectedLogLevel}
                    onChange={(e) => {
                      const level = e.target.value as typeof LOG_LEVELS[number];
                      setSelectedLogLevel(level);
                      void updateLogConfiguration(logDisabled, level);
                    }}
                    disabled={logDisabled}
                    className="px-3 py-1.5 text-sm rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-base) text-(--wb-text-primary) outline-none focus:border-(--wb-accent) disabled:opacity-50"
                  >
                    {LOG_LEVELS.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                  <div className="w-px h-4 bg-(--wb-border-subtle) mx-1" />
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm text-(--wb-text-secondary)">Disable</span>
                    <Switch
                      checked={logDisabled}
                      onCheckedChange={(checked) => {
                        setLogDisabled(checked);
                        void updateLogConfiguration(checked, selectedLogLevel);
                      }}
                    />
                  </div>
                </div>
              }
            />
          )}
        </SettingGroup>

        {/* Application */}
        <SettingGroup title="Application">
          <SettingCard
            icon={<FolderOpenRegular />}
            title="App Directory"
            description="Open the folder containing config files, overrides, and logs"
            control={
              <Button
                size="sm"
                variant="accent"
                onClick={() => void openAppDirectory()}
              >
                Open Folder
              </Button>
            }
          />
        </SettingGroup>

        {/* About */}
        <SettingGroup title="About">
          <SettingCard
            icon={<InfoRegular />}
            title="Fresh Box"
            description={
              <div className="flex flex-col text-xs text-(--wb-text-secondary) mt-1 gap-0.5">
                <span>UI: FluentUI v9 + Tailwind v4</span>
                <span>Framework: Tauri + React 19</span>
              </div>
            }
          />
        </SettingGroup>
      </div>
    </div>
  );
}
