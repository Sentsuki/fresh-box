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
  PlayCircleRegular,
} from "@fluentui/react-icons";
import { useConfigStore } from "../../stores/configStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useConfigs } from "../../hooks/useConfigs";
import { Button } from "../../components/ui/Button";
import { SettingGroup } from "../../components/ui/SettingCard";
import { PageHeader } from "../../components/ui/PageHeader";
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
    <div className="flex flex-col h-full overflow-y-auto pr-2 pb-10">
      <PageHeader 
        title="Profiles" 
        description="Manage local sing-box configurations and remote subscriptions."
      >
        <Button
          icon={<AddRegular />}
          variant="subtle"
          onClick={() => void selectConfigFile()}
        >
          Import Local
        </Button>
        <Button
          icon={<CloudArrowDownRegular />}
          variant="accent"
          onClick={() => {
            const url = prompt("Subscription URL:");
            if (url) void addSubscription(url);
          }}
        >
          Add Subscription
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-8">
        <SettingGroup title="Remote Subscriptions">
          {subscriptionFiles.length === 0 ? (
            <div className="py-8 text-center text-sm text-(--wb-text-secondary) bg-(--wb-surface-layer) border border-(--wb-border-subtle) rounded-(--wb-radius-md) shadow-sm">
              No subscriptions. Click "Add Subscription" to add one.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </SettingGroup>

        <SettingGroup title="Local Files">
          {localFiles.length === 0 ? (
            <div className="py-8 text-center text-sm text-(--wb-text-secondary) bg-(--wb-surface-layer) border border-(--wb-border-subtle) rounded-(--wb-radius-md) shadow-sm">
              No local config files. Click "Import Local" to add one.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </SettingGroup>
      </div>
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
      save(e as unknown as React.MouseEvent);
    } else if (e.key === "Escape") {
      cancel();
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-3 p-4 rounded-(--wb-radius-md) border border-(--wb-border-subtle) bg-(--wb-surface-layer) shadow-sm" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-semibold text-(--wb-text-secondary) uppercase tracking-wider">Rename File</p>
        <input
          autoFocus
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-base) px-3 py-2 text-sm text-(--wb-text-primary) outline-none focus:border-(--wb-accent)"
        />
        <div className="flex gap-2 justify-end mt-1">
          <Button size="sm" variant="ghost" icon={<DismissRegular />} onClick={(e) => { e.stopPropagation(); cancel(); }}>Cancel</Button>
          <Button size="sm" variant="accent" icon={<SaveRegular />} onClick={save}>Save</Button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={[
        "flex flex-col p-4 rounded-(--wb-radius-md) border transition-all duration-200 shadow-sm",
        selected
          ? "border-(--wb-accent) bg-(--wb-surface-selected)"
          : "border-(--wb-border-subtle) bg-(--wb-surface-layer) hover:bg-(--wb-surface-hover)"
      ].join(" ")}
    >
      <div className="flex items-start gap-3 mb-4">
        <div className={`p-2 rounded-lg flex-shrink-0 ${selected ? 'bg-(--wb-accent) text-white' : 'bg-(--wb-surface-base) text-(--wb-text-secondary)'}`}>
          <DocumentRegular className="text-xl" />
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="text-sm font-semibold truncate text-(--wb-text-primary)">
            {name}
          </p>
          <p className="text-xs text-(--wb-text-tertiary) truncate mt-0.5" title={path}>{path}</p>
        </div>
      </div>
      
      <div className="mt-auto flex items-center justify-between pt-3 border-t border-(--wb-border-subtle)">
        <Button
          size="sm"
          variant={selected ? "subtle" : "accent"}
          icon={selected ? <CheckmarkRegular /> : <PlayCircleRegular />}
          onClick={selected ? undefined : onSelect}
          disabled={selected}
        >
          {selected ? "Active" : "Activate"}
        </Button>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" icon={<OpenRegular />} onClick={(e) => { e.stopPropagation(); onOpen(); }} title="Open in editor" />
          <Button size="sm" variant="ghost" icon={<EditRegular />} onClick={startEdit} title="Rename" />
          <Button size="sm" variant="ghost" icon={<DeleteRegular />} onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete" />
        </div>
      </div>
    </div>
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
      save(e as unknown as React.MouseEvent);
    } else if (e.key === "Escape") {
      cancel();
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-3 p-4 rounded-(--wb-radius-md) border border-(--wb-border-subtle) bg-(--wb-surface-layer) shadow-sm" onClick={(e) => e.stopPropagation()}>
        <div>
          <p className="text-xs font-semibold text-(--wb-text-secondary) uppercase tracking-wider mb-1">Name</p>
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-base) px-3 py-2 text-sm text-(--wb-text-primary) outline-none focus:border-(--wb-accent)"
          />
        </div>
        <div>
          <p className="text-xs font-semibold text-(--wb-text-secondary) uppercase tracking-wider mb-1">Subscription URL</p>
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="https://..."
            className="w-full rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-base) px-3 py-2 text-sm text-(--wb-text-primary) outline-none focus:border-(--wb-accent)"
          />
        </div>
        <div className="flex gap-2 justify-end mt-1">
          <Button size="sm" variant="ghost" icon={<DismissRegular />} onClick={(e) => { e.stopPropagation(); cancel(); }}>Cancel</Button>
          <Button size="sm" variant="accent" icon={<SaveRegular />} onClick={save}>Save</Button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={[
        "flex flex-col p-4 rounded-(--wb-radius-md) border transition-all duration-200 shadow-sm",
        selected
          ? "border-(--wb-accent) bg-(--wb-surface-selected)"
          : "border-(--wb-border-subtle) bg-(--wb-surface-layer) hover:bg-(--wb-surface-hover)"
      ].join(" ")}
    >
      <div className="flex items-start gap-3 mb-4">
        <div className={`p-2 rounded-lg flex-shrink-0 ${selected ? 'bg-(--wb-accent) text-white' : 'bg-(--wb-surface-base) text-(--wb-text-secondary)'}`}>
          <CloudArrowDownRegular className="text-xl" />
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="text-sm font-semibold text-(--wb-text-primary) truncate">
            {name}
          </p>
          <p className="text-xs text-(--wb-text-tertiary) truncate mt-0.5" title={sub.url}>
            {sub.url}
          </p>
          {sub.lastUpdated && (
            <p className="text-[10px] font-medium text-(--wb-text-disabled) mt-1.5 uppercase tracking-wide">
              Updated {formatLastUpdated(sub.lastUpdated)}
            </p>
          )}
        </div>
      </div>
      
      <div className="mt-auto flex items-center justify-between pt-3 border-t border-(--wb-border-subtle)">
        <Button
          size="sm"
          variant={selected ? "subtle" : "accent"}
          icon={selected ? <CheckmarkRegular /> : <PlayCircleRegular />}
          onClick={selected ? undefined : onSelect}
          disabled={selected}
        >
          {selected ? "Active" : "Activate"}
        </Button>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" icon={<ArrowClockwiseRegular />} onClick={(e) => { e.stopPropagation(); onUpdate(); }} title="Update" />
          <Button size="sm" variant="ghost" icon={<OpenRegular />} onClick={(e) => { e.stopPropagation(); onOpen(); }} title="Open in editor" />
          <Button size="sm" variant="ghost" icon={<EditRegular />} onClick={startEdit} title="Edit" />
          <Button size="sm" variant="ghost" icon={<DeleteRegular />} onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete" />
        </div>
      </div>
    </div>
  );
}
