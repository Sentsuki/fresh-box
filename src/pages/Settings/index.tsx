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
  ShieldTaskRegular,
  WeatherMoonRegular,
} from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/ui/PageHeader";
import { Select } from "../../components/ui/Select";
import { SettingCard, SettingGroup } from "../../components/ui/SettingCard";
import { Switch } from "../../components/ui/Switch";
import {
  LOG_LEVELS,
  STACK_OPTIONS,
  usePriorityConfig,
} from "../../hooks/usePriorityConfig";
import {
  getSingboxStatus,
  installDaemonService,
  isDaemonServiceInstalled,
  openAppDirectory,
  uninstallDaemonService,
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

  // Daemon Windows service (install/uninstall — each triggers a UAC prompt)
  const [serviceInstalled, setServiceInstalled] = useState<boolean | null>(
    null,
  );
  const [isServiceBusy, setIsServiceBusy] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);

  const refreshServiceInstalled = async () => {
    try {
      setServiceInstalled(await isDaemonServiceInstalled());
    } catch {
      setServiceInstalled(null);
    }
  };

  useEffect(() => {
    void refreshServiceInstalled();
  }, []);

  const toggleDaemonService = async () => {
    setIsServiceBusy(true);
    setServiceError(null);
    try {
      if (serviceInstalled) {
        await uninstallDaemonService();
      } else {
        await installDaemonService();
      }
      await refreshServiceInstalled();
      await refreshProcessStatus();
    } catch (e) {
      setServiceError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsServiceBusy(false);
    }
  };

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
            icon={<ShieldTaskRegular />}
            title="sing-box Daemon Service"
            description={
              serviceError ? (
                <span className="text-(--wb-error)">{serviceError}</span>
              ) : serviceInstalled === null ? (
                "Checking whether the sing-box-daemon Windows service is installed..."
              ) : serviceInstalled ? (
                "The sing-box-daemon Windows service is installed."
              ) : (
                "The sing-box-daemon Windows service is not installed yet. Installing requires administrator approval."
              )
            }
            control={
              <Button
                size="sm"
                variant={serviceInstalled ? "subtle" : "accent"}
                disabled={isServiceBusy || serviceInstalled === null}
                onClick={() => void toggleDaemonService()}
              >
                {isServiceBusy
                  ? "Working..."
                  : serviceInstalled
                    ? "Uninstall"
                    : "Install"}
              </Button>
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
