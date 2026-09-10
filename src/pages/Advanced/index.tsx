import {
  BoxRegular,
  DocumentTextRegular,
  SaveRegular,
} from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { SettingCard, SettingGroup } from "../../components/ui/SettingCard";
import { Switch } from "../../components/ui/Switch";
import { PageHeader } from "../../components/ui/PageHeader";
import { Tabs, TabContent } from "../../components/ui/Tabs";
import { useToast } from "../../hooks/useToast";
import {
  LOG_LEVELS,
  STACK_OPTIONS,
  usePriorityConfig,
} from "../../hooks/usePriorityConfig";
import {
  clearConfigOverride,
  disableConfigOverride,
  enableConfigOverride,
  isConfigOverrideEnabled,
  loadConfigOverride,
  saveConfigOverride,
  listCrashReports,
  readCrashReport,
  deleteCrashReport,
  exportCrashReport,
  deleteAllCrashReports,
  listOomReports,
  readOomReport,
  deleteOomReport,
  exportOomReport,
  deleteAllOomReports,
  listPowerReports,
  readPowerReport,
  deletePowerReport,
  exportPowerReport,
  deleteAllPowerReports,
} from "../../services/api";
import { CoreInfoGroup } from "./CoreInfoGroup";
import DiagnosticsTab from "./DiagnosticsTab";
import { ReportsPanel } from "./ReportsPanel";
import { OomSettingsPanel, PowerSettingsPanel } from "./ReportSettings";

/** TUN Stack / Core Log Level — moved here from Settings: both tune the
 * running sing-box config the same way the JSON editor below does, so they
 * belong next to it rather than in the general app-preferences page.
 *
 * 组名是 "Setup" 而不是原来的 "sing-box Core"：整个标签页现在就叫 sing-box
 * Core，再嵌一个同名分组只会让人以为点错了地方。这一组是「怎么跑」的可调
 * 项，Core 那一组是核心自身的状态。 */
function CoreSettingsGroup() {
  const {
    isLoading,
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

  if (isLoading || (!hasStackField && !hasLogField)) return null;

  return (
    <SettingGroup title="Setup">
      {hasStackField && (
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

      {hasLogField && (
        <SettingCard
          icon={<DocumentTextRegular />}
          title="Core Log Level"
          description="Log output detail from the sing-box core"
          control={
            <div className="flex items-center gap-3">
              <Select
                value={selectedLogLevel}
                onChange={(e) => {
                  const level = e.target.value as (typeof LOG_LEVELS)[number];
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
  );
}

function CoreTab() {
  const toast = useToast();

  const [rawJson, setRawJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [togglingOverride, setTogglingOverride] = useState(false);

  useEffect(() => {
    void Promise.all([
      // 覆盖层现在以 JSON 文本过界（见 `save_config_override` 的注释），
      // 前端本来就是当文本编辑的，不用再 stringify 一次。
      loadConfigOverride().then((raw) => {
        if (raw.trim() && raw.trim() !== "{}") {
          setRawJson(raw);
        }
      }),
      isConfigOverrideEnabled().then(setOverrideEnabled),
    ]).catch(() => {});
  }, []);

  const toggleOverrideEnabled = async () => {
    setTogglingOverride(true);
    try {
      if (overrideEnabled) {
        await disableConfigOverride();
        setOverrideEnabled(false);
        toast.success("Config override disabled");
      } else {
        await enableConfigOverride();
        setOverrideEnabled(true);
        toast.success("Config override enabled");
      }
    } catch (err) {
      toast.error(
        `Failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setTogglingOverride(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // JSON 合法性由 Rust 侧判断，报错信息更贴合上下文。
      await saveConfigOverride(rawJson);
      toast.success("Config overrides saved");
    } catch (err) {
      toast.error(
        `Failed to save: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleClearOverride = async () => {
    try {
      await clearConfigOverride();
      setRawJson("");
      toast.success("Config override cleared");
    } catch (err) {
      toast.error(
        `Failed to clear: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      <CoreSettingsGroup />
      <CoreInfoGroup />

      <div className="flex flex-col gap-1 pt-2 border-t border-(--wb-border-subtle)">
        <h2 className="text-sm font-semibold text-(--wb-text-primary) px-1">
          Config Override
        </h2>
        <p className="text-xs text-(--wb-text-secondary) px-1">
          Write custom JSON rules to override the active sing-box configuration.
        </p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Switch
            checked={overrideEnabled}
            onCheckedChange={() => void toggleOverrideEnabled()}
            disabled={togglingOverride}
            label="Inject Overrides"
          />
          {togglingOverride && (
            <span className="text-xs text-(--wb-text-secondary)">...</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="subtle" onClick={() => void handleClearOverride()}>
            Clear
          </Button>
          <Button
            variant="accent"
            icon={<SaveRegular />}
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving..." : "Save Overrides"}
          </Button>
        </div>
      </div>

      <div className="bg-(--wb-surface-layer) rounded-(--wb-radius-lg) border border-(--wb-border-subtle) shadow-sm overflow-hidden flex-1 min-h-[400px]">
        <textarea
          value={rawJson}
          onChange={(e) => setRawJson(e.target.value)}
          className="w-full h-full min-h-[400px] font-mono text-sm p-4 bg-transparent text-(--wb-text-primary) resize-y outline-none"
          placeholder="{...}"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

const ADVANCED_TABS = [
  // 标签页叫 "sing-box Core"，但 value 仍是 "override"：那是持久化/默认标签
  // 用的 key，改它没有任何好处，只会让老状态失效。
  { value: "override", label: "sing-box Core" },
  { value: "diagnostics", label: "Diagnostics" },
  { value: "crash", label: "Crash Reports" },
  { value: "oom", label: "OOM Reports" },
  { value: "power", label: "Power Reports" },
];

export default function Advanced() {
  return (
    <div className="flex flex-col h-full overflow-hidden pr-2 pb-10">
      <PageHeader
        title="Advanced"
        description="sing-box core settings, configuration overrides, network diagnostics and crash/OOM/power reports."
      />

      <Tabs
        tabs={ADVANCED_TABS}
        defaultValue="override"
        className="flex-1 min-h-0 mt-4"
      >
        <div className="flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
          <TabContent value="override" className="h-full">
            <CoreTab />
          </TabContent>
          <TabContent value="diagnostics">
            <DiagnosticsTab />
          </TabContent>
          <TabContent value="crash">
            <ReportsPanel
              title="Crash Reports"
              description="Native sing-box and fresh-box crashes, and renderer errors caught in the app."
              emptyHint="No crash reports yet."
              api={{
                list: listCrashReports,
                read: readCrashReport,
                remove: deleteCrashReport,
                removeAll: deleteAllCrashReports,
                export: exportCrashReport,
              }}
            />
          </TabContent>
          <TabContent value="oom">
            <ReportsPanel
              title="OOM Reports"
              description="Recorded when sing-box exceeds the memory limit below (or when triggered manually)."
              emptyHint="No OOM reports yet."
              api={{
                list: listOomReports,
                read: readOomReport,
                remove: deleteOomReport,
                removeAll: deleteAllOomReports,
                export: exportOomReport,
              }}
              settingsPanel={<OomSettingsPanel />}
            />
          </TabContent>
          <TabContent value="power">
            <ReportsPanel
              title="Power Reports"
              description="Recorded around unexpected sleep/resume or shutdown events while sing-box was running."
              emptyHint="No power reports yet."
              api={{
                list: listPowerReports,
                read: readPowerReport,
                remove: deletePowerReport,
                removeAll: deleteAllPowerReports,
                export: exportPowerReport,
              }}
              settingsPanel={<PowerSettingsPanel />}
            />
          </TabContent>
        </div>
      </Tabs>
    </div>
  );
}
