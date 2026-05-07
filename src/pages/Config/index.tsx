import { useEffect, useState } from "react";
import {
  AddRegular,
  DeleteRegular,
  EditRegular,
  CloudArrowDownRegular,
  DocumentRegular,
  ArrowClockwiseRegular,
  CheckmarkRegular,
  OpenRegular,
  DismissRegular,
  SaveRegular,
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
    renameConfig,
    editSubscription,
  } = useConfigs();

  useEffect(() => {
    void initializeConfigs();
  }, [initializeConfigs]);

  const localFiles = configFiles.filter((f) => !subscriptions[f.displayName]);
  const subscriptionFiles = configFiles.filter((f) => !!subscriptions[f.displayName]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-(--wb-text-primary)">Config</h1>
        <p className="text-sm text-(--wb-text-secondary) mt-0.5">
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
          <p className="text-sm text-(--wb-text-secondary) px-1">
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
                  onOpen={() => void openConfigFile(file.displayName)}
                  onDelete={() => void deleteConfig(file.displayName)}
                  onRename={(newName, newUrl) =>
                    void renameAndEditSub(file.displayName, newName, newUrl, renameConfig, editSubscription)
                  }
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
          <p className="text-sm text-(--wb-text-secondary) px-1">
            No local config files. Click Import to add one.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {localFiles.map((file) => {
              const isSelected = selectedDisplay === file.displayName;
              return (
                <LocalFileCard
                  key={file.path}
                  name={file.displayName}
                  path={file.path}
                  selected={isSelected}
                  onSelect={() => void selectConfig(file)}
                  onOpen={() => void openConfigFile(file.displayName)}
                  onDelete={() => void deleteConfig(file.displayName)}
                  onRename={(newName) =>
                    void renameConfig(file.displayName, newName)
                  }
                />
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

async function renameAndEditSub(
  oldName: string,
  newName: string,
  newUrl: string,
  renameConfig: (oldName: string, newName: string) => Promise<void>,
  editSubscription: (name: string, url: string) => Promise<void>,
) {
  const nameChanged = newName !== oldName;
  const effectiveName = nameChanged ? newName : oldName;
  if (nameChanged) await renameConfig(oldName, newName);
  if (newUrl) await editSubscription(effectiveName, newUrl);
}

function LocalFileCard({
  name,
  path,
  selected,
  onSelect,
  onOpen,
  onDelete,
  onRename,
}: {
  name: string;
  path: string;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onRename: (newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(name);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setNameInput(name);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
  }

  function save(e: React.MouseEvent) {
    e.stopPropagation();
    if (nameInput.trim() && nameInput.trim() !== name) {
      onRename(nameInput.trim());
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      if (nameInput.trim() && nameInput.trim() !== name) {
        onRename(nameInput.trim());
      }
      setEditing(false);
    } else if (e.key === "Escape") {
      cancel();
    }
  }

  if (editing) {
    return (
      <Card selected={selected}>
        <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
          <p className="text-xs font-medium text-(--wb-text-secondary)">File Name</p>
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-(--wb-radius-sm) border border-(--wb-border-subtle) bg-(--wb-surface-base) px-2 py-1.5 text-sm text-(--wb-text-primary) outline-none focus:border-(--wb-accent)"
          />
          <div className="flex gap-1 justify-end">
            <Button size="sm" variant="accent" icon={<SaveRegular />} onClick={save}>Save</Button>
            <Button size="sm" variant="ghost" icon={<DismissRegular />} onClick={(e) => { e.stopPropagation(); cancel(); }}>Cancel</Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card selected={selected} onClick={onSelect}>
      <div className="flex items-start gap-2">
        <DocumentRegular className="flex-shrink-0 text-(--wb-text-secondary) mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate text-(--wb-text-primary)">
            {name}
          </p>
          <p className="text-xs text-(--wb-text-tertiary) truncate">{path}</p>
        </div>
        {selected && (
          <CheckmarkRegular className="flex-shrink-0 text-(--wb-accent) text-sm" />
        )}
      </div>
      <div className="mt-2 flex gap-1 justify-end">
        <Button
          size="sm"
          variant="ghost"
          icon={<OpenRegular />}
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
        >
          Open
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<EditRegular />}
          onClick={startEdit}
        >
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<DeleteRegular />}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
        >
          Delete
        </Button>
      </div>
    </Card>
  );
}

function SubscriptionCard({
  name,
  sub,
  selected,
  onSelect,
  onUpdate,
  onOpen,
  onDelete,
  onRename,
}: {
  name: string;
  sub: SubscriptionInfo;
  selected: boolean;
  onSelect: () => void;
  onUpdate: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onRename: (newName: string, newUrl: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(name);
  const [urlInput, setUrlInput] = useState(sub.url);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setNameInput(name);
    setUrlInput(sub.url);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
  }

  function save(e: React.MouseEvent) {
    e.stopPropagation();
    onRename(nameInput.trim() || name, urlInput.trim());
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      onRename(nameInput.trim() || name, urlInput.trim());
      setEditing(false);
    } else if (e.key === "Escape") {
      cancel();
    }
  }

  if (editing) {
    return (
      <Card selected={selected}>
        <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
          <div>
            <p className="text-xs font-medium text-(--wb-text-secondary) mb-1">Name</p>
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full rounded-(--wb-radius-sm) border border-(--wb-border-subtle) bg-(--wb-surface-base) px-2 py-1.5 text-sm text-(--wb-text-primary) outline-none focus:border-(--wb-accent)"
            />
          </div>
          <div>
            <p className="text-xs font-medium text-(--wb-text-secondary) mb-1">Subscription URL</p>
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://..."
              className="w-full rounded-(--wb-radius-sm) border border-(--wb-border-subtle) bg-(--wb-surface-base) px-2 py-1.5 text-sm text-(--wb-text-primary) outline-none focus:border-(--wb-accent)"
            />
          </div>
          <div className="flex gap-1 justify-end">
            <Button size="sm" variant="accent" icon={<SaveRegular />} onClick={save}>Save</Button>
            <Button size="sm" variant="ghost" icon={<DismissRegular />} onClick={(e) => { e.stopPropagation(); cancel(); }}>Cancel</Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card selected={selected} onClick={onSelect}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <CloudArrowDownRegular className="flex-shrink-0 text-(--wb-accent) mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-(--wb-text-primary) truncate">
              {name}
            </p>
            <p className="text-xs text-(--wb-text-tertiary) truncate max-w-xs">
              {sub.url}
            </p>
            {sub.lastUpdated && (
              <p className="text-xs text-(--wb-text-disabled) mt-0.5">
                Updated {formatLastUpdated(sub.lastUpdated)}
              </p>
            )}
          </div>
        </div>
        {selected && (
          <CheckmarkRegular className="flex-shrink-0 text-(--wb-accent) text-sm" />
        )}
      </div>
      <div className="flex gap-1 mt-2 justify-end">
        <Button
          size="sm"
          variant="ghost"
          icon={<OpenRegular />}
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
        >
          Open
        </Button>
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
          icon={<EditRegular />}
          onClick={startEdit}
        >
          Edit
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
