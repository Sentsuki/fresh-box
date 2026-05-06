import { useState, useMemo } from "react";
import { Input, Button, Spinner } from "@fluentui/react-components";
import { ArrowDownloadRegular, FolderOpenRegular } from "@fluentui/react-icons";
import { useAppStore } from "../../stores/appStore";
import { useConfigs } from "../../hooks/useConfigs";

export default function SubscriptionList() {
  const [subscriptionUrl, setSubscriptionUrl] = useState("");
  const pendingOperations = useAppStore((state) => state.pendingOperations);
  const configs = useConfigs();

  const isLoading = pendingOperations > 0;
  const canAddSubscription = useMemo(
    () => !!subscriptionUrl.trim() && !isLoading,
    [subscriptionUrl, isLoading]
  );

  const submitSubscription = () => {
    if (!canAddSubscription) return;
    void configs.addSubscription(subscriptionUrl.trim());
    setSubscriptionUrl("");
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex flex-col md:flex-row gap-3">
        <Input
          value={subscriptionUrl}
          onChange={(_, data) => setSubscriptionUrl(data.value)}
          disabled={isLoading}
          placeholder="Enter subscription URL"
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") submitSubscription();
          }}
        />
        <Button
          appearance="primary"
          icon={isLoading ? <Spinner size="extra-tiny" /> : <ArrowDownloadRegular />}
          disabled={!canAddSubscription}
          onClick={submitSubscription}
        >
          {isLoading ? "Subscribing..." : "Subscribe"}
        </Button>
      </div>
      <div className="flex w-full">
        <Button
          appearance="secondary"
          icon={<FolderOpenRegular />}
          disabled={isLoading}
          onClick={() => void configs.selectConfigFile()}
          className="w-full"
        >
          Add Config
        </Button>
      </div>
    </div>
  );
}
