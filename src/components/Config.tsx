import { Text, Card } from "@fluentui/react-components";
import SubscriptionList from "./config/SubscriptionList";
import ConfigFileGrid from "./config/ConfigFileGrid";

export default function Config() {
  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden pb-4">
      <div className="flex items-center justify-between">
        <Text size={600} weight="semibold">Configuration Files</Text>
      </div>

      <div className="flex flex-col gap-4 h-full min-h-0 overflow-y-auto">
        <Card className="p-4 bg-neutral-800 shrink-0">
          <SubscriptionList />
        </Card>
        <ConfigFileGrid />
      </div>
    </div>
  );
}
