import {
  BoxRegular,
  DocumentTextRegular,
  SaveRegular,
} from "@fluentui/react-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { SettingCard, SettingGroup } from "../../components/ui/SettingCard";
import { Switch } from "../../components/ui/Switch";
import { PageHeader } from "../../components/ui/PageHeader";
import { Tabs, TabContent } from "../../components/ui/Tabs";
import { useToast } from "../../hooks/useToast";
import {
  STACK_OPTIONS,
  usePriorityConfig,
} from "../../hooks/usePriorityConfig";
import { LOG_LEVELS } from "../../types/app";
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
import { queryKeys } from "../../services/queryClient";
import { getErrorMessage } from "../../services/tauri";

/** TUN Stack / Core Log Level — moved here from Settings: both tune the
 * running sing-box config the same way the JSON editor below does, so they
 * belong next to it rather than in the general app-preferences page.
 *
 * 组名是 "Setup" 而不是原来的 "sing-box Core"：整个标签页现在就叫 sing-box
 * Core，再嵌一个同名分组只会让人以为点错了地方。这一组是「怎么跑」的可调
 * 项，Core 那一组是核心自身的状态。 */
const STACK_SELECT_OPTIONS = STACK_OPTIONS.map((stack) => ({
  value: stack,
  label: stack,
}));
const LOG_LEVEL_SELECT_OPTIONS = LOG_LEVELS.map((level) => ({
  value: level,
  label: level,
}));

function CoreSettingsGroup() {
  const {
    isLoading,
    hasStackField,
    hasLogField,
    selectedStack,
    logDisabled,
    selectedLogLevel,
    setStackOption,
    setLogConfiguration,
  } = usePriorityConfig();

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
              onValueChange={setStackOption}
              options={STACK_SELECT_OPTIONS}
            />
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
                onValueChange={(level) =>
                  setLogConfiguration(logDisabled, level)
                }
                options={LOG_LEVEL_SELECT_OPTIONS}
                disabled={logDisabled}
              />
              <div className="w-px h-4 bg-(--wb-border-subtle) mx-1" />
              <div className="flex items-center gap-2.5">
                <span className="text-sm text-(--wb-text-secondary)">
                  Disable
                </span>
                <Switch
                  checked={logDisabled}
                  onCheckedChange={(checked) =>
                    setLogConfiguration(checked, selectedLogLevel)
                  }
                />
              </div>
            </div>
          }
        />
      )}
    </SettingGroup>
  );
}

interface ConfigOverrideState {
  raw: string;
  enabled: boolean;
}

function CoreTab() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const override = useQuery({
    queryKey: queryKeys.configOverride,
    queryFn: async (): Promise<ConfigOverrideState> => {
      // 覆盖层以 JSON 文本过界（见 `save_config_override` 的注释），前端本来
      // 就是当文本编辑的，不用再 stringify 一次。
      const [raw, enabled] = await Promise.all([
        loadConfigOverride(),
        isConfigOverrideEnabled(),
      ]);
      // `{}` 是「什么都没写」的占位，编辑框里显示成空。
      return { raw: raw.trim() && raw.trim() !== "{}" ? raw : "", enabled };
    },
  });

  // 编辑中的文本；`null` = 没改过，显示读到的内容。单独存是为了读取慢的时候，
  // 结果回来不会盖掉用户已经敲进去的东西。
  const [draft, setDraft] = useState<string | null>(null);
  const rawJson = draft ?? override.data?.raw ?? "";
  const overrideEnabled = override.data?.enabled ?? false;

  const patchOverride = (patch: Partial<ConfigOverrideState>) =>
    queryClient.setQueryData<ConfigOverrideState>(
      queryKeys.configOverride,
      (old) => old && { ...old, ...patch },
    );

  const toggleEnabled = useMutation({
    mutationFn: (enable: boolean) =>
      enable ? enableConfigOverride() : disableConfigOverride(),
    onSuccess: (_, enable) => {
      patchOverride({ enabled: enable });
      toast.success(
        enable ? "Config override enabled" : "Config override disabled",
      );
    },
    onError: (err) => toast.error(`Failed: ${getErrorMessage(err)}`),
  });

  const save = useMutation({
    // JSON 合法性由 Rust 侧判断，报错信息更贴合上下文。
    mutationFn: (raw: string) => saveConfigOverride(raw),
    onSuccess: (_, raw) => {
      patchOverride({ raw });
      setDraft(null);
      toast.success("Config overrides saved");
    },
    onError: (err) => toast.error(`Failed to save: ${getErrorMessage(err)}`),
  });

  const clear = useMutation({
    mutationFn: clearConfigOverride,
    onSuccess: () => {
      patchOverride({ raw: "" });
      setDraft(null);
      toast.success("Config override cleared");
    },
    onError: (err) => toast.error(`Failed to clear: ${getErrorMessage(err)}`),
  });

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
            onCheckedChange={(checked) => toggleEnabled.mutate(checked)}
            disabled={toggleEnabled.isPending}
            label="Inject Overrides"
          />
          {toggleEnabled.isPending && (
            <span className="text-xs text-(--wb-text-secondary)">...</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="subtle"
            disabled={clear.isPending}
            onClick={() => clear.mutate()}
          >
            Clear
          </Button>
          <Button
            variant="accent"
            icon={<SaveRegular />}
            disabled={save.isPending}
            onClick={() => save.mutate(rawJson)}
          >
            {save.isPending ? "Saving..." : "Save Overrides"}
          </Button>
        </div>
      </div>

      <div className="bg-(--wb-surface-layer) rounded-(--wb-radius-lg) border border-(--wb-border-subtle) shadow-sm overflow-hidden flex-1 min-h-[400px]">
        <textarea
          value={rawJson}
          onChange={(e) => setDraft(e.target.value)}
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
              kind="crash"
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
              kind="oom"
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
              kind="power"
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
