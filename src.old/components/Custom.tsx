import { Text } from "@fluentui/react-components";
import ConfigOverrideSection from "./settings/ConfigOverrideSection";
import LogSettingsSection from "./settings/LogSettingsSection";
import { useSettings } from "../hooks/useSettings";

export default function Custom() {
  const settings = useSettings({ loadCustomerSettings: true });

  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden pb-4">
      <div className="flex items-center justify-between">
        <Text size={600} weight="semibold">Custom</Text>
      </div>

      <div className="flex flex-col gap-6 h-full min-h-0 overflow-y-auto pr-2">
        <LogSettingsSection
          isLoading={settings.isLoading}
          enableTransitions={settings.enableTransitions}
          selectedStackOption={settings.selectedStackOption}
          stackOptions={settings.stackOptions}
          hasStackField={settings.hasStackField}
          logDisabled={settings.logDisabled}
          selectedLogLevel={settings.selectedLogLevel}
          logLevels={settings.logLevels}
          hasLogField={settings.hasLogField}
          onSetStackOption={settings.setStackOption}
          onLogDisabledChange={settings.toggleLogDisabled}
          onSetLogLevel={settings.setLogLevel}
        />

        <ConfigOverrideSection
          enabled={settings.isOverrideEnabled}
          onEnabledChange={settings.setOverrideEnabled}
          config={settings.overrideConfig}
          onConfigChange={settings.setOverrideConfig}
          isValidJson={settings.isValidJson}
          jsonError={settings.jsonError}
          onSave={() => void settings.saveOverride()}
          onClear={() => void settings.clearOverride()}
        />
      </div>
    </div>
  );
}
