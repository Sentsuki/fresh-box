import {
  ArrowSyncRegular,
  BoxRegular,
  DismissRegular,
  DocumentTextRegular,
  FolderOpenRegular,
  GlobeRegular,
  InfoRegular,
  KeyRegular,
  LinkRegular,
  SettingsRegular,
  WeatherMoonRegular,
} from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/ui/PageHeader";
import { Select } from "../../components/ui/Select";
import { SettingCard, SettingGroup } from "../../components/ui/SettingCard";
import { Switch } from "../../components/ui/Switch";
import { useCoreUpdate } from "../../hooks/useCoreUpdate";
import {
  LOG_LEVELS,
  STACK_OPTIONS,
  usePriorityConfig,
} from "../../hooks/usePriorityConfig";
import {
  flushDnsCache,
  flushFakeIpCache,
  getSingboxStatus,
  openAppDirectory,
} from "../../services/api";
import { useSettingsStore } from "../../stores/settingsStore";
import type { ThemeMode } from "../../types/app";

export default function Settings() {
  const settings = useSettingsStore((s) => s.settings);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const testUrl = useSettingsStore((s) => s.settings.settings.test_url);
  const setTestUrl = useSettingsStore((s) => s.setTestUrl);
  const [testUrlInput, setTestUrlInput] = useState(testUrl);
  const closeBehavior = useSettingsStore(
    (s) => s.settings.settings.close_behavior,
  );
  const setCloseBehavior = useSettingsStore((s) => s.setCloseBehavior);
  const autoCloseConnections = useSettingsStore(
    (s) => s.settings.settings.auto_close_connections,
  );
  const setAutoCloseConnections = useSettingsStore(
    (s) => s.setAutoCloseConnections,
  );

  const currentThemeMode = settings.settings.theme_mode;

  // App version
  const [appVersion, setAppVersion] = useState<string | null>(null);
  useEffect(() => {
    void getVersion()
      .then(setAppVersion)
      .catch(() => null);
  }, []);

  // Process Management
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [processStatus, setProcessStatus] = useState<string | null>(null);

  const refreshProcessStatus = async () => {
    setIsRefreshingStatus(true);
    try {
      const status = await getSingboxStatus();
      setProcessStatus(status);
    } catch {
      setProcessStatus("Failed to get process status.");
    } finally {
      setIsRefreshingStatus(false);
    }
  };

  // Core Update Manager
  const {
    isRefreshingCoreStatus,
    isUpdatingCore,
    coreStatus,
    coreStatusError,
    coreUpdateProgress,
    selectedCoreOptionKey,
    setSelectedCoreOptionKey,
    selectedOption,
    currentCoreLabel,
    coreStatusText,
    updateCoreButtonLabel,
    refreshCoreStatus,
    applySelectedCore,
    cancelUpdate,
    cacheState,
  } = useCoreUpdate(true);
  const availableOptions = coreStatus?.available_options ?? [];
  const controlsEnabled = cacheState === "fresh" || cacheState === "stale";

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
    clashApiController,
    setClashApiController,
    clashApiSecret,
    setClashApiSecret,
    loadConfiguration,
    setStackOption,
    updateLogConfiguration,
    updateClashApiConfig,
    genRandomPort,
    genRandomSecret,
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
              <Select
                value={currentThemeMode}
                onChange={(e) => void setThemeMode(e.target.value as ThemeMode)}
              >
                <option value="system">Follow System</option>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </Select>
            }
          />
        </SettingGroup>

        {/* Core Settings */}
        <SettingGroup title="sing-box Core">
          {!isPriorityLoading && hasStackField && (
            <SettingCard
              icon={<BoxRegular />}
              title="TUN Stack"
              description="Select the network stack for the TUN interface (applied on restart)"
              control={
                <Select
                  value={selectedStack}
                  onChange={(e) =>
                    void setStackOption(
                      e.target.value as (typeof STACK_OPTIONS)[number],
                    )
                  }
                >
                  {STACK_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </Select>
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
                  <Select
                    value={selectedLogLevel}
                    onChange={(e) => {
                      const level = e.target
                        .value as (typeof LOG_LEVELS)[number];
                      setSelectedLogLevel(level);
                      void updateLogConfiguration(logDisabled, level);
                    }}
                    disabled={logDisabled}
                  >
                    {LOG_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </Select>
                  <div className="w-px h-4 bg-(--wb-border-subtle) mx-1" />
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm text-(--wb-text-secondary)">
                      Disable
                    </span>
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
          <SettingCard
            icon={<LinkRegular />}
            title="API Controller"
            description="The address:port for the Clash API"
            control={
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={clashApiController}
                  onChange={(e) => setClashApiController(e.target.value)}
                  placeholder="127.0.0.1:8964"
                  className="px-3 py-1.5 text-sm rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-base) text-(--wb-text-primary) outline-none focus:border-(--wb-accent) w-32"
                />
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={async () => {
                    const controller = await genRandomPort();
                    if (controller) {
                      await updateClashApiConfig({
                        external_controller: controller,
                        secret: clashApiSecret,
                      });
                    }
                  }}
                >
                  Random Port
                </Button>
              </div>
            }
          />
          <SettingCard
            icon={<KeyRegular />}
            title="API Secret"
            description="Authentication secret for the Clash API"
            control={
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={clashApiSecret}
                  onChange={(e) => setClashApiSecret(e.target.value)}
                  placeholder="secret"
                  className="px-3 py-1.5 text-sm rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-base) text-(--wb-text-primary) outline-none focus:border-(--wb-accent) w-74"
                />
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={async () => {
                    const secret = await genRandomSecret();
                    if (secret) {
                      await updateClashApiConfig({
                        external_controller: clashApiController,
                        secret,
                      });
                    }
                  }}
                >
                  Random
                </Button>
              </div>
            }
          />
          <SettingCard
            icon={<ArrowSyncRegular />}
            title="Flush Cache"
            description="Clear internal DNS cache or Fake-IP mappings"
            control={
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() => void flushFakeIpCache()}
                >
                  Flush Fake-IP
                </Button>
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() => void flushDnsCache()}
                >
                  Flush DNS
                </Button>
              </div>
            }
          />
        </SettingGroup>

        {/* Application */}
        <SettingGroup title="Application">
          <SettingCard
            icon={<ArrowSyncRegular />}
            title="Core Version"
            description={
              <div className="flex flex-col gap-1 mt-1">
                <span>
                  {coreStatusText} (Current: {currentCoreLabel})
                </span>
                {coreStatusError && (
                  <span className="text-(--wb-error)">{coreStatusError}</span>
                )}
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
                {coreStatus && cacheState === "no_cache" && (
                  <span className="text-[11px] text-(--wb-text-tertiary) italic">
                    No version list — click Check to load available releases.
                  </span>
                )}
                {coreStatus && cacheState === "stale" && (
                  <span className="text-[11px] text-amber-500/80 italic">
                    Version list may be outdated — click Check to refresh.
                  </span>
                )}
              </div>
            }
            control={
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  variant="subtle"
                  icon={
                    <ArrowSyncRegular
                      className={isRefreshingCoreStatus ? "animate-spin" : ""}
                    />
                  }
                  disabled={isRefreshingCoreStatus}
                  onClick={() => void refreshCoreStatus(true, true)}
                >
                  Check
                </Button>

                {availableOptions.length > 0 && (
                  <>
                    <div className="w-px h-4 bg-(--wb-border-subtle) mx-1" />
                    <Select
                      value={selectedCoreOptionKey}
                      disabled={isUpdatingCore || !controlsEnabled}
                      onChange={(e) => {
                        const newKey = e.target.value;
                        const opt = availableOptions.find(
                          (o) => `${o.channel}:${o.version}` === newKey,
                        );
                        if (opt && !(opt.installed && opt.is_active)) {
                          // Trigger install/activate first; setSelectedCoreOptionKey
                          // is called inside applySelectedCore after success.
                          void applySelectedCore(newKey);
                        } else {
                          // Already active — just persist the selection.
                          void setSelectedCoreOptionKey(newKey);
                        }
                      }}
                    >
                      {availableOptions.map((opt) => (
                        <option
                          key={`${opt.channel}:${opt.version}`}
                          value={`${opt.channel}:${opt.version}`}
                        >
                          {opt.label}
                          {opt.installed ? (opt.is_active ? " ✓" : "") : ""}
                        </option>
                      ))}
                    </Select>
                    {isUpdatingCore && (
                      <Button
                        size="sm"
                        variant="subtle"
                        onClick={() => void cancelUpdate()}
                      >
                        Cancel
                      </Button>
                    )}
                    {!isUpdatingCore &&
                      controlsEnabled &&
                      selectedOption?.installed &&
                      selectedOption?.is_active && (
                        <Button
                          size="sm"
                          variant="accent"
                          onClick={() => void applySelectedCore()}
                        >
                          {updateCoreButtonLabel}
                        </Button>
                      )}
                  </>
                )}
              </div>
            }
          />
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
          <SettingCard
            icon={<GlobeRegular />}
            title="Test URL"
            description="URL used for proxy latency tests"
            control={
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={testUrlInput}
                  onChange={(e) => setTestUrlInput(e.target.value)}
                  onBlur={() => void setTestUrl(testUrlInput)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void setTestUrl(testUrlInput);
                  }}
                  placeholder="https://www.gstatic.com/generate_204"
                  className="px-3 py-1.5 text-sm rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-base) text-(--wb-text-primary) outline-none focus:border-(--wb-accent) w-66"
                />
              </div>
            }
          />

          <SettingCard
            icon={<DismissRegular />}
            title="Close Button Behavior"
            description="Choose what happens when the window close button is clicked"
            control={
              <Select
                value={closeBehavior}
                onChange={(e) =>
                  void setCloseBehavior(e.target.value as "hide" | "destroy")
                }
              >
                <option value="hide">Hide to tray</option>
                <option value="destroy">Destroy window</option>
              </Select>
            }
          />

          <SettingCard
            icon={<LinkRegular />}
            title="Auto Close Connections on Switch"
            description="When switching proxy nodes, automatically close active connections that pass through the affected group"
            control={
              <Switch
                checked={autoCloseConnections}
                onCheckedChange={(checked) =>
                  void setAutoCloseConnections(checked)
                }
              />
            }
          />

          <SettingCard
            icon={<SettingsRegular />}
            title="sing-box Process Status"
            description={
              processStatus ? (
                <div className="mt-1 text-xs font-mono text-(--wb-text-secondary) whitespace-pre-wrap break-all">
                  {processStatus}
                </div>
              ) : (
                "Click Refresh to check the current status of the sing-box process."
              )
            }
            control={
              <Button
                size="sm"
                variant="subtle"
                icon={
                  <ArrowSyncRegular
                    className={isRefreshingStatus ? "animate-spin" : ""}
                  />
                }
                disabled={isRefreshingStatus}
                onClick={() => void refreshProcessStatus()}
              >
                Check
              </Button>
            }
          />
        </SettingGroup>

        {/* About */}
        <SettingGroup title="About">
          <SettingCard
            icon={<InfoRegular />}
            title="fresh-box"
            description={
              <div className="flex flex-col text-xs text-(--wb-text-secondary) mt-1 gap-0.5">
                <span>Version {appVersion ?? "..."}</span>
              </div>
            }
          />
        </SettingGroup>
      </div>
    </div>
  );
}
