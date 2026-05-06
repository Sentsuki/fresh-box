import { useState } from "react";
import {
  Card,
  Text,
  Badge,
  Button,
  Input,
  Spinner,
} from "@fluentui/react-components";
import {
  LinkRegular,
  DocumentRegular,
  OpenRegular,
  ArrowClockwiseRegular,
  EditRegular,
  DeleteRegular,
  CheckmarkRegular,
  DismissRegular,
} from "@fluentui/react-icons";
import { formatLastUpdated } from "../../services/utils";
import { useConfigs } from "../../hooks/useConfigs";
import type { ConfigFileEntry, SubscriptionInfo } from "../../types/app";

interface Props {
  config: ConfigFileEntry;
  isSelected: boolean;
  subscription?: SubscriptionInfo;
  isLoading: boolean;
}

export default function ConfigFileCard({ config, isSelected, subscription, isLoading }: Props) {
  const configs = useConfigs();
  const [isManaging, setIsManaging] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [editingSubscriptionUrl, setEditingSubscriptionUrl] = useState("");

  const startManage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLoading) return;
    setIsManaging(true);
    setNewFileName(config.displayName);
    setEditingSubscriptionUrl(subscription?.url ?? "");
  };

  const cancelManage = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsManaging(false);
    setNewFileName("");
    setEditingSubscriptionUrl("");
  };

  const saveManage = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const nextFileName =
      newFileName !== config.displayName ? newFileName : config.displayName;

    if (newFileName !== config.displayName) {
      await configs.renameConfig(config.displayName, newFileName);
    }

    if (editingSubscriptionUrl !== (subscription?.url ?? "")) {
      await configs.editSubscription(nextFileName, editingSubscriptionUrl);
    }

    cancelManage();
  };

  const handleKeydown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      void saveManage();
    } else if (event.key === "Escape") {
      cancelManage();
    }
  };

  const handleSelect = () => {
    if (isManaging || isLoading) return;
    void configs.selectConfig(config);
  };

  if (isManaging) {
    return (
      <Card className="border-brand-500 bg-brand-500/10 cursor-default" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col gap-4 p-2">
          <Text size={400} weight="semibold">Edit Configuration</Text>
          
          <div className="flex flex-col gap-1">
            <Text size={200} weight="medium">File Name</Text>
            <Input
              value={newFileName}
              onChange={(_, data) => setNewFileName(data.value)}
              disabled={isLoading}
              onKeyDown={handleKeydown}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1">
            <Text size={200} weight="medium">Subscription URL</Text>
            <Input
              value={editingSubscriptionUrl}
              onChange={(_, data) => setEditingSubscriptionUrl(data.value)}
              placeholder="Enter subscription URL (optional)"
              disabled={isLoading}
              onKeyDown={handleKeydown}
            />
          </div>

          <div className="flex gap-2">
            <Button
              appearance="primary"
              icon={isLoading ? <Spinner size="extra-tiny" /> : <CheckmarkRegular />}
              disabled={isLoading}
              onClick={saveManage}
            >
              Save
            </Button>
            <Button
              appearance="secondary"
              icon={<DismissRegular />}
              disabled={isLoading}
              onClick={cancelManage}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      className={`cursor-pointer transition-all duration-200 ${
        isSelected ? "border-brand-500 bg-brand-500/10" : "border-neutral-700 bg-neutral-800 hover:border-neutral-500"
      }`}
      onClick={handleSelect}
    >
      <div className="flex items-center justify-between p-1">
        <div className="flex flex-col min-w-0 grow gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {subscription ? <LinkRegular /> : <DocumentRegular />}
            <Text weight="semibold" className="truncate max-w-[150px]" title={config.displayName}>
              {config.displayName}
            </Text>
            {subscription && (
              <Badge color="informative" shape="rounded" appearance="tint">
                Subscription
              </Badge>
            )}
            {isSelected && (
              <Badge color="success" shape="rounded" appearance="tint">
                Active
              </Badge>
            )}
          </div>
          {subscription && (
            <Text size={200} className="text-neutral-500">
              {formatLastUpdated(subscription.lastUpdated)}
            </Text>
          )}
        </div>

        <div className="flex items-center shrink-0 gap-1 ml-2">
          <Button
            appearance="subtle"
            icon={<OpenRegular />}
            disabled={isLoading}
            onClick={(e) => {
              e.stopPropagation();
              void configs.openConfigFile(config.displayName);
            }}
            title="Open configuration file"
          />
          {subscription && (
            <Button
              appearance="subtle"
              icon={<ArrowClockwiseRegular />}
              disabled={isLoading}
              onClick={(e) => {
                e.stopPropagation();
                void configs.updateSubscription(config.displayName);
              }}
              title="Update from subscription"
            />
          )}
          <Button
            appearance="subtle"
            icon={<EditRegular />}
            disabled={isLoading}
            onClick={startManage}
            title="Edit configuration"
          />
          <Button
            appearance="subtle"
            icon={<DeleteRegular className="text-red-500" />}
            disabled={isLoading}
            onClick={(e) => {
              e.stopPropagation();
              void configs.deleteConfig(config.displayName);
            }}
            title="Delete configuration"
          />
        </div>
      </div>
    </Card>
  );
}
