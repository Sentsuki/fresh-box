import {
  ArrowDownloadRegular,
  BoxRegular,
  DismissRegular,
  DocumentTextRegular,
  FolderOpenRegular,
  InfoRegular,
  LinkRegular,
  RocketRegular,
  ShieldTaskRegular,
  WeatherMoonRegular,
  WrenchRegular,
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
  disableAutostart,
  enableAutostart,
  installDaemonService,
  isAutostartEnabled,
  isDaemonServiceInstalled,
  openAppDirectory,
  openExternalUrl,
  repairDaemonService,
  uninstallDaemonService,
} from "../../services/api";
import { getErrorKind } from "../../services/tauri";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUpdateStore } from "../../stores/updateStore";
import type { ThemeMode } from "../../types/app";

export default function Settings() {
  const settings = useSettingsStore((s) => s.settings);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
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

  // GitHub-release update check — detection only, see `UpdateInfo`'s doc
  // comment. `info` may already be populated here from the startup check
  // (`App.tsx`'s `update-available` listener) even before this page is
  // ever opened.
  const updateInfo = useUpdateStore((s) => s.info);
  const isCheckingUpdate = useUpdateStore((s) => s.isChecking);
  const updateCheckError = useUpdateStore((s) => s.checkError);
  const checkForUpdateNow = useUpdateStore((s) => s.checkNow);

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

  // A declined UAC prompt surfaces as `CommandError::PermissionDenied` —
  // the user just changed their mind, not a real failure, so (unlike every
  // other failure here) it's not shown as one.
  const reportServiceError = (e: unknown) => {
    if (getErrorKind(e) === "permission_denied") return;
    setServiceError(e instanceof Error ? e.message : String(e));
  };

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
    } catch (e) {
      reportServiceError(e);
    } finally {
      setIsServiceBusy(false);
    }
  };

  // Lighter fix for "installed but unreachable" (stopped, crashed and
  // didn't come back, ...) than the uninstall/reinstall above — just
  // restarts the service in place.
  const repairService = async () => {
    setIsServiceBusy(true);
    setServiceError(null);
    try {
      await repairDaemonService();
    } catch (e) {
      reportServiceError(e);
    } finally {
      setIsServiceBusy(false);
    }
  };

  // Launch at Windows startup (registry Run-key entry)
  const [autostartEnabled, setAutostartEnabled] = useState<boolean | null>(
    null,
  );
  const [isAutostartBusy, setIsAutostartBusy] = useState(false);
  const [autostartError, setAutostartError] = useState<string | null>(null);

  const refreshAutostartEnabled = async () => {
    try {
      setAutostartEnabled(await isAutostartEnabled());
    } catch {
      setAutostartEnabled(null);
    }
  };

  useEffect(() => {
    void refreshAutostartEnabled();
  }, []);

  const toggleAutostart = async (checked: boolean) => {
    setIsAutostartBusy(true);
    setAutostartError(null);
    try {
      if (checked) {
        await enableAutostart();
      } else {
        await disableAutostart();
      }
      await refreshAutostartEnabled();
    } catch (e) {
      setAutostartError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsAutostartBusy(false);
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
                <span className="text-(--wb-error) whitespace-pre-wrap break-all font-mono text-xs">
                  {serviceError}
                </span>
              ) : serviceInstalled === null ? (
                "Checking whether the sing-box-daemon Windows service is installed..."
              ) : serviceInstalled ? (
                "The sing-box-daemon Windows service is installed. If sing-box won't connect, try restarting the service before reinstalling it."
              ) : (
                "The sing-box-daemon Windows service is not installed yet. Installing requires administrator approval."
              )
            }
            control={
              <div className="flex items-center gap-2">
                {serviceInstalled && (
                  <Button
                    size="sm"
                    variant="subtle"
                    icon={<WrenchRegular />}
                    disabled={isServiceBusy}
                    onClick={() => void repairService()}
                  >
                    Restart Service
                  </Button>
                )}
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
              </div>
            }
          />

          <SettingCard
            icon={<RocketRegular />}
            title="Launch at Startup"
            description={
              autostartError ? (
                <span className="text-(--wb-error) whitespace-pre-wrap break-all font-mono text-xs">
                  {autostartError}
                </span>
              ) : (
                "Start fresh-box (minimized to the tray) when you sign in to Windows"
              )
            }
            control={
              <Switch
                checked={autostartEnabled === true}
                disabled={isAutostartBusy || autostartEnabled === null}
                onCheckedChange={(checked) => void toggleAutostart(checked)}
              />
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
          <SettingCard
            icon={<ArrowDownloadRegular />}
            title="Updates"
            description={
              updateCheckError ? (
                <span className="text-(--wb-error)">{updateCheckError}</span>
              ) : updateInfo?.available ? (
                `fresh-box ${updateInfo.latestVersion} is available — fresh-box never downloads or installs it for you.`
              ) : updateInfo ? (
                "You're on the latest version."
              ) : (
                "Checks GitHub for new releases. Never downloads or installs one on its own — updating is always a manual step."
              )
            }
            control={
              <div className="flex items-center gap-2">
                {updateInfo?.available && updateInfo.releaseUrl && (
                  <Button
                    size="sm"
                    variant="accent"
                    icon={<LinkRegular />}
                    onClick={() => {
                      const { releaseUrl } = updateInfo;
                      if (releaseUrl) void openExternalUrl(releaseUrl);
                    }}
                  >
                    View Release
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="subtle"
                  disabled={isCheckingUpdate}
                  onClick={() => void checkForUpdateNow()}
                >
                  {isCheckingUpdate ? "Checking..." : "Check for Updates"}
                </Button>
              </div>
            }
          />
        </SettingGroup>
      </div>
    </div>
  );
}
