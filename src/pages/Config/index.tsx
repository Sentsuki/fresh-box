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
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold text-(--wb-text-primary) tracking-tight">Config</h1>
        <p className="text-sm text-(--wb-text-secondary) mt-1">
          Manage your sing-box configuration files and subscriptions.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold text-(--wb-text-tertiary) uppercase tracking-wider">Subscriptions</h3>
          <Button
            icon={<AddRegular />}
            variant="accent"
            size="sm"
            onClick={() => {
              const url = prompt("Subscription URL:");
              if (url) void addSubscription(url);
            }}
          >
            Add New
          </Button>
        </div>

        {subscriptionFiles.length === 0 ? (
          <div className="py-10 text-center bg-(--wb-surface-layer) rounded-(--wb-radius-lg) border border-dashed border-(--wb-border-subtle)">
            <CloudArrowDownRegular className="text-4xl text-(--wb-text-disabled) mb-2 mx-auto" />
            <p className="text-sm text-(--wb-text-secondary)">No subscriptions added yet.</p>
          </div>
        ) : (
          <div className="grid gap-3">
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
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold text-(--wb-text-tertiary) uppercase tracking-wider">Local Files</h3>
          <Button
            icon={<AddRegular />}
            variant="subtle"
            size="sm"
            onClick={() => void selectConfigFile()}
          >
            Import File
          </Button>
        </div>

        {localFiles.length === 0 ? (
          <div className="py-10 text-center bg-(--wb-surface-layer) rounded-(--wb-radius-lg) border border-dashed border-(--wb-border-subtle)">
            <DocumentRegular className="text-4xl text-(--wb-text-disabled) mb-2 mx-auto" />
            <p className="text-sm text-(--wb-text-secondary)">No local config files imported.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
      </section>
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
        <div className="flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
          <div>
            <p className="text-xs font-semibold text-(--wb-text-tertiary) mb-1.5 uppercase">File Name</p>
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-layer-alt) px-3 py-2 text-sm text-(--wb-text-primary) outline-none focus:border-(--wb-accent) transition-all"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="accent" icon={<CheckmarkRegular />} onClick={save}>Save</Button>
            <Button size="sm" variant="subtle" icon={<DismissRegular />} onClick={(e) => { e.stopPropagation(); cancel(); }}>Cancel</Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card selected={selected} onClick={onSelect} className="group h-full flex flex-col justify-between">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${selected ? "bg-(--wb-accent)/10 text-(--wb-accent)" : "bg-(--wb-surface-active) text-(--wb-text-secondary)"}`}>
          <DocumentRegular className="text-lg" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate text-(--wb-text-primary)">
            {name}
          </p>
          <p className="text-xs text-(--wb-text-tertiary) truncate mt-0.5">{path}</p>
        </div>
      </div>
      <div className="mt-4 flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          size="sm"
          variant="subtle"
          icon={<OpenRegular />}
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          title="Open file"
        />
        <Button
          size="sm"
          variant="subtle"
          icon={<EditRegular />}
          onClick={startEdit}
          title="Rename"
        />
        <Button
          size="sm"
          variant="subtle"
          icon={<DeleteRegular />}
          className="hover:text-(--wb-error) hover:bg-(--wb-error)/10"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete"
        />
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
        <div className="flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-(--wb-text-tertiary) mb-1.5 uppercase">Name</p>
              <input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-layer-alt) px-3 py-2 text-sm text-(--wb-text-primary) outline-none focus:border-(--wb-accent) transition-all"
              />
            </div>
            <div>
              <p className="text-xs font-semibold text-(--wb-text-tertiary) mb-1.5 uppercase">Subscription URL</p>
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="https://..."
                className="w-full rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-layer-alt) px-3 py-2 text-sm text-(--wb-text-primary) outline-none focus:border-(--wb-accent) transition-all"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="accent" icon={<CheckmarkRegular />} onClick={save}>Save Changes</Button>
            <Button size="sm" variant="subtle" icon={<DismissRegular />} onClick={(e) => { e.stopPropagation(); cancel(); }}>Cancel</Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card selected={selected} onClick={onSelect} className="group">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          <div className={`p-2.5 rounded-xl ${selected ? "bg-(--wb-accent)/10 text-(--wb-accent)" : "bg-(--wb-surface-active) text-(--wb-text-secondary)"}`}>
            <CloudArrowDownRegular className="text-xl" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-(--wb-text-primary) truncate">
              {name}
            </p>
            <p className="text-xs text-(--wb-text-tertiary) truncate max-w-md mt-0.5">
              {sub.url}
            </p>
            {sub.lastUpdated && (
              <p className="text-[10px] font-semibold text-(--wb-text-disabled) mt-1.5 uppercase tracking-wider">
                Last updated {formatLastUpdated(sub.lastUpdated)}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 self-end md:self-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="sm"
            variant="subtle"
            icon={<ArrowClockwiseRegular />}
            onClick={(e) => {
              e.stopPropagation();
              onUpdate();
            }}
            title="Update subscription"
          >
            Update
          </Button>
          <div className="w-px h-4 bg-(--wb-border-subtle) mx-1" />
          <Button
            size="sm"
            variant="subtle"
            icon={<OpenRegular />}
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
            title="Open file"
          />
          <Button
            size="sm"
            variant="subtle"
            icon={<EditRegular />}
            onClick={startEdit}
            title="Edit subscription"
          />
          <Button
            size="sm"
            variant="subtle"
            icon={<DeleteRegular />}
            className="hover:text-(--wb-error) hover:bg-(--wb-error)/10"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete"
          />
        </div>
      </div>
    </Card>
  );
}

