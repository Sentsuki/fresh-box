import { Text, Card, Button } from "@fluentui/react-components";
import { FolderOpenRegular } from "@fluentui/react-icons";
import ProcessManager from "./settings/ProcessManager";
import SingboxCoreSection from "./settings/SingboxCoreSection";
import { useSettings } from "../hooks/useSettings";
import { useAppStore } from "../stores/appStore";

export default function Settings() {
  const appStore = useAppStore();
  const settings = useSettings({
    loadCustomerSettings: false,
    autoRefreshCoreStatus: true,
  });

  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden pb-4">
      <div className="flex items-center justify-between">
        <Text size={600} weight="semibold">Settings</Text>
      </div>

      <div className="flex flex-col gap-6 h-full min-h-0 overflow-y-auto pr-2">
        <SingboxCoreSection
          coreStatus={settings.coreStatus}
          coreStatusError={settings.coreStatusError}
          coreUpdateProgress={settings.coreUpdateProgress}
          currentCoreLabel={settings.currentCoreLabel}
          selectedCoreLabel={settings.selectedCoreLabel}
          selectedCoreOptionKey={settings.selectedCoreOptionKey}
          availableOptions={settings.coreStatus?.available_options ?? []}
          coreStatusText={settings.coreStatusText}
          coreStatusBadgeClass={settings.coreStatusBadgeClass}
          isRefreshingCoreStatus={settings.isRefreshingCoreStatus}
          isUpdatingCore={settings.isUpdatingCore}
          updateCoreButtonLabel={settings.updateCoreButtonLabel}
          onRefresh={() => void settings.refreshCoreStatus(true, true)}
          onApply={() => void settings.applySelectedCore()}
          onSelectedCoreOptionKeyChange={(val) => {
            void appStore.setSelectedCoreOptionKey(val);
          }}
        />

        <Card className="flex flex-col gap-4 p-4 bg-neutral-800">
          <Text size={500} weight="semibold">Open Directory</Text>
          <div className="flex">
            <Button
              appearance="secondary"
              icon={<FolderOpenRegular />}
              onClick={() => void settings.openApplicationDirectory()}
            >
              Open App Directory
            </Button>
          </div>
        </Card>

        <ProcessManager
          isRefreshingStatus={settings.isRefreshingStatus}
          processStatus={settings.processStatus}
          processStatusClass={settings.processStatusClass}
          onRefresh={() => void settings.refreshManagedProcessStatus()}
        />
      </div>
    </div>
  );
}
