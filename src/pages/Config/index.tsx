import { useEffect } from "react";
import {
  AddRegular,
  DeleteRegular,
  EditRegular,
  CloudArrowDownRegular,
  DocumentRegular,
  ArrowClockwiseRegular,
  CheckmarkRegular,
} from "@fluentui/react-icons";
import { useConfigStore } from "../../stores/configStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useConfigs } from "../../hooks/useConfigs";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Section } from "../../components/ui/Section";
import { formatLastUpdated } from "../../services/utils";
import type { SubscriptionInfo } from "../../types/app";

export default function Config() {
  const configFiles = useConfigStore((s) => s.configFiles);
  const subscriptions = useConfigStore((s) => s.subscriptions);
  const selectedDisplay = useSettingsStore(
    (s) => s.settings.app.selected_config_display,
  );

  const {
    initializeConfigs,
    selectConfig,
    selectConfigFile,
    addSubscription,
    updateSubscription,
    deleteConfig,
    openConfigFile,
  } = useConfigs();

  useEffect(() => {
    void initializeConfigs();
  }, [initializeConfigs]);

  const localFiles = configFiles.filter((f) => !subscriptions[f.displayName]);
  const subscriptionFiles = configFiles.filter((f) => !!subscriptions[f.displayName]);

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-[var(--wb-text-primary)]">Config</h1>
        <p className="text-sm text-[var(--wb-text-secondary)] mt-0.5">
          Manage sing-box configuration files
        </p>
      </div>

      <Section
        title="Subscriptions"
        actions={
          <Button
            icon={<AddRegular />}
            variant="accent"
            size="sm"
            onClick={() => {
              const url = prompt("Subscription URL:");
              if (url) void addSubscription(url);
            }}
          >
            Add
          </Button>
        }
      >
        {subscriptionFiles.length === 0 ? (
          <p className="text-sm text-[var(--wb-text-secondary)] px-1">
            No subscriptions. Click Add to add one.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {subscriptionFiles.map((file) => {
              const sub = subscriptions[file.displayName];
              return (
                <SubscriptionCard
                  key={file.displayName}
                  name={file.displayName}
                  sub={sub}
                  selected={selectedDisplay === file.displayName}
                  onSelect={() => void selectConfig(file)}
                  onUpdate={() => void updateSubscription(file.displayName)}
                  onDelete={() => void deleteConfig(file.displayName)}
                />
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title="Local Files"
        actions={
          <Button
            icon={<AddRegular />}
            variant="subtle"
            size="sm"
            onClick={() => void selectConfigFile()}
          >
            Import
          </Button>
        }
      >
        {localFiles.length === 0 ? (
          <p className="text-sm text-[var(--wb-text-secondary)] px-1">
            No local config files. Click Import to add one.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {localFiles.map((file) => {
              const isSelected = selectedDisplay === file.displayName;
              return (
                <Card
                  key={file.path}
                  selected={isSelected}
                  onClick={() => void selectConfig(file)}
                >
                  <div className="flex items-start gap-2">
                    <DocumentRegular className="flex-shrink-0 text-[var(--wb-text-secondary)] mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-[var(--wb-text-primary)]">
                        {file.displayName}
                      </p>
                      <p className="text-xs text-[var(--wb-text-tertiary)] truncate">{file.path}</p>
                    </div>
                    {isSelected && (
                      <CheckmarkRegular className="flex-shrink-0 text-[var(--wb-accent)] text-sm" />
                    )}
                  </div>
                  <div className="mt-2 flex gap-1 justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<EditRegular />}
                      onClick={(e) => {
                        e.stopPropagation();
                        void openConfigFile(file.displayName);
                      }}
                    >
                      Edit
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

function SubscriptionCard({
  name,
  sub,
  selected,
  onSelect,
  onUpdate,
  onDelete,
}: {
  name: string;
  sub: SubscriptionInfo;
  selected: boolean;
  onSelect: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  return (
    <Card selected={selected} onClick={onSelect}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <CloudArrowDownRegular className="flex-shrink-0 text-[var(--wb-accent)] mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--wb-text-primary)] truncate">
              {name}
            </p>
            <p className="text-xs text-[var(--wb-text-tertiary)] truncate max-w-xs">
              {sub.url}
            </p>
            {sub.lastUpdated && (
              <p className="text-xs text-[var(--wb-text-disabled)] mt-0.5">
                Updated {formatLastUpdated(sub.lastUpdated)}
              </p>
            )}
          </div>
        </div>
        {selected && (
          <CheckmarkRegular className="flex-shrink-0 text-[var(--wb-accent)] text-sm" />
        )}
      </div>
      <div className="flex gap-1 mt-2 justify-end">
        <Button
          size="sm"
          variant="subtle"
          icon={<ArrowClockwiseRegular />}
          onClick={(e) => {
            e.stopPropagation();
            onUpdate();
          }}
        >
          Update
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<DeleteRegular />}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          Delete
        </Button>
      </div>
    </Card>
  );
}
