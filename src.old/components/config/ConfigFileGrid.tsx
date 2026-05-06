import { Text } from "@fluentui/react-components";
import { DocumentCopyRegular } from "@fluentui/react-icons";
import { useAppStore } from "../../stores/appStore";
import ConfigFileCard from "./ConfigFileCard";

export default function ConfigFileGrid() {
  const configFiles = useAppStore((state) => state.configFiles);
  const selectedConfigPath = useAppStore((state) => state.appSettings.app.selected_config_path);
  const subscriptions = useAppStore((state) => state.subscriptions);
  const pendingOperations = useAppStore((state) => state.pendingOperations);
  
  const hasConfigFiles = configFiles.length > 0;
  const isLoading = pendingOperations > 0;

  if (!hasConfigFiles) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-neutral-500">
        <DocumentCopyRegular className="text-6xl opacity-30 mb-4" />
        <Text size={500} weight="semibold" className="mb-2 text-neutral-300">
          No Configuration Files
        </Text>
        <Text className="max-w-md">
          Add a configuration file by subscribing to a URL or selecting a local file
        </Text>
      </div>
    );
  }

  return (
    <div className="grid w-full gap-4 mt-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
      {configFiles.map((config) => (
        <ConfigFileCard
          key={config.path}
          config={config}
          isSelected={config.path === selectedConfigPath}
          subscription={subscriptions[config.displayName]}
          isLoading={isLoading}
        />
      ))}
    </div>
  );
}
