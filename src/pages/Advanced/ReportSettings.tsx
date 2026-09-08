import { Section } from "../../components/ui/Section";
import { Select } from "../../components/ui/Select";
import { Switch } from "../../components/ui/Switch";
import { useSettingsStore } from "../../stores/settingsStore";

const MEMORY_LIMIT_OPTIONS_MB = [50, 100, 200, 300, 500, 750, 1024];

/** Enables the daemon's soft memory limit (`StartOptions.oom_memory_limit`)
 * and OOM reporting — lives here, right above the OOM report list it
 * controls, rather than in Settings (see `config::app_settings::DiagnosticsSettings`'s
 * doc comment for why fresh-box mirrors the official client's placement). */
export function OomSettingsPanel() {
  const diagnostics = useSettingsStore((s) => s.settings.diagnostics);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  return (
    <Section
      title="Memory Limit"
      description="Applies the next time sing-box starts. When enabled, exceeding the limit produces an OOM report below."
    >
      <div className="flex flex-col gap-4 p-4 rounded-(--wb-radius-lg) border border-(--wb-border-subtle) bg-(--wb-surface-layer)">
        <Switch
          checked={diagnostics.oom_killer_enabled}
          onCheckedChange={(value) =>
            void updateSettings((s) => {
              s.diagnostics.oom_killer_enabled = value;
            })
          }
          label="Enable memory limit"
        />
        {diagnostics.oom_killer_enabled && (
          <>
            <label className="flex items-center justify-between">
              <span className="text-sm text-(--wb-text-primary)">
                Memory limit
              </span>
              <Select
                value={diagnostics.oom_memory_limit_mb}
                onChange={(e) =>
                  void updateSettings((s) => {
                    s.diagnostics.oom_memory_limit_mb = Number(e.target.value);
                  })
                }
              >
                {MEMORY_LIMIT_OPTIONS_MB.map((mb) => (
                  <option key={mb} value={mb}>
                    {mb} MB
                  </option>
                ))}
              </Select>
            </label>
            {/* 这里曾经有一个「超限时断开连接以释放内存」开关 —— 但
                `StartOptions` proto 根本没有对应字段，打开它什么都不会发生
                （审计项 M-11）。阶段 5 连同它的设置项一起删除。 */}
          </>
        )}
      </div>
    </Section>
  );
}

/** Enables the daemon's power-event reporting (`StartOptions.power_report_enabled`)
 * — same placement rationale as `OomSettingsPanel`. */
export function PowerSettingsPanel() {
  const diagnostics = useSettingsStore((s) => s.settings.diagnostics);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  return (
    <Section
      title="Power Reporting"
      description="Applies the next time sing-box starts. Records a report around unexpected sleep/resume or shutdown events while it was running."
    >
      <div className="p-4 rounded-(--wb-radius-lg) border border-(--wb-border-subtle) bg-(--wb-surface-layer)">
        <Switch
          checked={diagnostics.power_report_enabled}
          onCheckedChange={(value) =>
            void updateSettings((s) => {
              s.diagnostics.power_report_enabled = value;
            })
          }
          label="Enable power reporting"
        />
      </div>
    </Section>
  );
}
