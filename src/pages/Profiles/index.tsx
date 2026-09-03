import {
  AddRegular,
  ArrowClockwiseRegular,
  CheckmarkRegular,
  CloudArrowDownRegular,
  DeleteRegular,
  DismissRegular,
  DocumentRegular,
  EditRegular,
  LinkRegular,
  OpenRegular,
  SaveRegular,
} from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Input } from "../../components/ui/Input";
import { PageHeader } from "../../components/ui/PageHeader";
import { SettingGroup } from "../../components/ui/SettingCard";
import { Switch } from "../../components/ui/Switch";
import { useConfigs } from "../../hooks/useConfigs";
import { formatLastUpdated } from "../../services/utils";
import { useConfigStore } from "../../stores/configStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { DEFAULT_AUTO_UPDATE_INTERVAL_MINUTES } from "../../types/app";

export default function Profiles() {
  const profiles = useConfigStore((s) => s.profiles);
  const selectedDisplay = useSettingsStore(
    (s) => s.settings.profiles.selected_config_display,
  );
  const pendingOperation = useConfigStore((s) => s.pendingOperation);

  const [isAddSubOpen, setIsAddSubOpen] = useState(false);
  const [newSubUrl, setNewSubUrl] = useState("");
  const [urlError, setUrlError] = useState("");

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
    setAutoUpdate,
  } = useConfigs();

  useEffect(() => {
    void initializeConfigs();
  }, [initializeConfigs]);

  const localFiles = profiles.filter((p) => !p.url);
  const subscriptionFiles = profiles.filter((p) => !!p.url);

  async function handleAddSubscription() {
    if (!newSubUrl.trim()) {
      setUrlError("URL is required");
      return;
    }
    try {
      new URL(newSubUrl);
    } catch {
      setUrlError("Please enter a valid URL");
      return;
    }
    await addSubscription(newSubUrl);
    setIsAddSubOpen(false);
    setNewSubUrl("");
    setUrlError("");
  }
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
          onClick={() => setIsAddSubOpen(true)}
        >
          Add Subscription
        </Button>
      </PageHeader>

      <Dialog
        isOpen={isAddSubOpen}
        onClose={() => {
          if (!pendingOperation) {
            setIsAddSubOpen(false);
            setNewSubUrl("");
            setUrlError("");
          }
        }}
        title="Add Subscription"
        icon={<CloudArrowDownRegular />}
        description="Enter the URL of your remote sing-box configuration."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setIsAddSubOpen(false);
                setNewSubUrl("");
                setUrlError("");
              }}
              disabled={pendingOperation}
            >
              Cancel
            </Button>
            <Button
              variant="accent"
              onClick={() => void handleAddSubscription()}
              disabled={pendingOperation}
            >
              {pendingOperation ? "Adding..." : "Add"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Input
            label="Subscription URL"
            autoFocus
            leftIcon={<LinkRegular />}
            value={newSubUrl}
            onChange={(e) => {
              setNewSubUrl(e.target.value);
              if (urlError) setUrlError("");
            }}
            error={urlError}
            placeholder="https://example.com/config.json"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !pendingOperation) {
                void handleAddSubscription();
              }
            }}
          />
        </div>
      </Dialog>

      <div className="flex flex-col gap-8">
        <SettingGroup title="Remote Subscriptions">
          {subscriptionFiles.length === 0 ? (
            <div className="py-8 text-center text-sm text-(--wb-text-secondary) bg-(--wb-surface-layer) border border-(--wb-border-subtle) rounded-(--wb-radius-md) shadow-sm">
              No subscriptions. Click &quot;Add Subscription&quot; to add one.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {subscriptionFiles.map((file) => (
                <SubscriptionCard
                  key={file.id}
                  name={file.name}
                  url={file.url ?? ""}
                  lastUpdated={file.lastUpdated}
                  autoUpdate={file.autoUpdate}
                  updateIntervalMinutes={file.updateIntervalMinutes}
                  selected={selectedDisplay === file.name}
                  onSelect={() => void selectConfig(file)}
                  onUpdate={() => updateSubscription(file.id)}
                  onOpen={() => void openConfigFile(file.id)}
                  onDelete={() => void deleteConfig(file.id)}
                  onToggleAutoUpdate={(enabled, minutes) =>
                    void setAutoUpdate(file.id, enabled, minutes)
                  }
                  onRename={(newName, newUrl) =>
                    void renameAndEditSub(
                      file.id,
                      file.name,
                      newName,
                      newUrl,
                      renameConfig,
                      editSubscription,
                    )
                  }
                />
              ))}
            </div>
          )}
        </SettingGroup>

        <SettingGroup title="Local Files">
          {localFiles.length === 0 ? (
            <div className="py-8 text-center text-sm text-(--wb-text-secondary) bg-(--wb-surface-layer) border border-(--wb-border-subtle) rounded-(--wb-radius-md) shadow-sm">
              No local config files. Click &quot;Import Local&quot; to add one.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {localFiles.map((file) => {
                const isSelected = selectedDisplay === file.name;
                return (
                  <LocalFileCard
                    key={file.id}
                    name={file.name}
                    path={file.path}
                    selected={isSelected}
                    onSelect={() => void selectConfig(file)}
                    onOpen={() => void openConfigFile(file.id)}
                    onDelete={() => void deleteConfig(file.id)}
                    onRename={(newName) => void renameConfig(file.id, newName)}
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
  id: string,
  oldName: string,
  newName: string,
  newUrl: string,
  renameConfig: (id: string, newName: string) => Promise<void>,
  editSubscription: (id: string, url: string) => Promise<void>,
) {
  if (newName !== oldName) await renameConfig(id, newName);
  if (newUrl) await editSubscription(id, newUrl);
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
      <div
        className="flex flex-col gap-3 p-4 rounded-(--wb-radius-md) border border-(--wb-border-subtle) bg-(--wb-surface-layer) shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <Input
          label="Rename File"
          autoFocus
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={handleKeyDown}
          leftIcon={<EditRegular />}
        />
        <div className="flex gap-2 justify-end mt-1">
          <Button
            size="sm"
            variant="ghost"
            icon={<DismissRegular />}
            onClick={(e) => {
              e.stopPropagation();
              cancel();
            }}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="accent"
            icon={<SaveRegular />}
            onClick={save}
          >
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        "relative overflow-hidden flex flex-col p-4 rounded-(--wb-radius-md) border transition-all duration-200 shadow-sm",
        selected
          ? "bg-(--wb-surface-selected) border-(--wb-accent) cursor-default"
          : "bg-(--wb-surface-layer) border-(--wb-border-subtle) hover:bg-(--wb-surface-hover) cursor-pointer",
      ].join(" ")}
      onClick={selected ? undefined : onSelect}
    >
      {selected && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-24 bg-(--wb-accent) rounded-r-full z-10" />
      )}
      <div className="flex items-start gap-3 mb-4">
        <div
          className={`p-2 rounded-lg shrink-0 ${selected ? "bg-(--wb-accent) text-white" : "bg-(--wb-surface-base) text-(--wb-text-secondary)"}`}
        >
          <DocumentRegular className="text-xl" />
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="text-sm font-semibold truncate text-(--wb-text-primary)">
            {name}
          </p>
          <p
            className="text-xs text-(--wb-text-tertiary) truncate mt-0.5"
            title={path}
          >
            {path}
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-end pt-3 border-t border-(--wb-border-subtle)">
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            icon={<OpenRegular />}
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            title="Open in editor"
          />
          <Button
            size="sm"
            variant="ghost"
            icon={<EditRegular />}
            onClick={startEdit}
            title="Rename"
          />
          <Button
            size="sm"
            variant="ghost"
            icon={<DeleteRegular />}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete"
          />
        </div>
      </div>
    </div>
  );
}

function SubscriptionCard({
  name,
  url,
  lastUpdated,
  autoUpdate,
  updateIntervalMinutes,
  selected,
  onSelect,
  onUpdate,
  onOpen,
  onDelete,
  onToggleAutoUpdate,
  onRename,
}: {
  name: string;
  url: string;
  lastUpdated?: string;
  autoUpdate: boolean;
  updateIntervalMinutes?: number;
  selected: boolean;
  onSelect: () => void;
  onUpdate: () => Promise<boolean | void>;
  onOpen: () => void;
  onDelete: () => void;
  onToggleAutoUpdate: (enabled: boolean, intervalMinutes?: number) => void;
  onRename: (newName: string, newUrl: string) => void;
}) {
  const [intervalInput, setIntervalInput] = useState(
    updateIntervalMinutes ?? DEFAULT_AUTO_UPDATE_INTERVAL_MINUTES,
  );
  const [editing, setEditing] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "updating" | "success"
  >("idle");
  const [nameInput, setNameInput] = useState(name);
  const [urlInput, setUrlInput] = useState(url);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setNameInput(name);
    setUrlInput(url);
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
      <div
        className="flex flex-col gap-3 p-4 rounded-(--wb-radius-md) border border-(--wb-border-subtle) bg-(--wb-surface-layer) shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <Input
          label="Name"
          autoFocus
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={handleKeyDown}
          leftIcon={<EditRegular />}
        />
        <Input
          label="Subscription URL"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="https://..."
          leftIcon={<LinkRegular />}
        />
        <div className="flex gap-2 justify-end mt-1">
          <Button
            size="sm"
            variant="ghost"
            icon={<DismissRegular />}
            onClick={(e) => {
              e.stopPropagation();
              cancel();
            }}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="accent"
            icon={<SaveRegular />}
            onClick={save}
          >
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        "relative overflow-hidden flex flex-col p-4 rounded-(--wb-radius-md) border transition-all duration-200 shadow-sm",
        selected
          ? "bg-(--wb-surface-selected) border-(--wb-accent) cursor-default"
          : "bg-(--wb-surface-layer) border-(--wb-border-subtle) hover:bg-(--wb-surface-hover) cursor-pointer",
      ].join(" ")}
      onClick={selected ? undefined : onSelect}
    >
      {selected && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-24 bg-(--wb-accent) rounded-r-full z-10" />
      )}
      <div className="flex items-start gap-3 mb-4">
        <div
          className={`p-2 rounded-lg shrink-0 ${selected ? "bg-(--wb-accent) text-white" : "bg-(--wb-surface-base) text-(--wb-text-secondary)"}`}
        >
          <CloudArrowDownRegular className="text-xl" />
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="text-sm font-semibold text-(--wb-text-primary) truncate">
            {name}
          </p>
          <p
            className="text-xs text-(--wb-text-tertiary) truncate mt-0.5"
            title={url}
          >
            {url}
          </p>
          {lastUpdated && (
            <p className="text-[10px] font-medium text-(--wb-text-disabled) mt-1.5 uppercase tracking-wide">
              Updated {formatLastUpdated(lastUpdated)}
            </p>
          )}
        </div>
      </div>

      <div
        className="flex items-center justify-between gap-2 py-1"
        onClick={(e) => e.stopPropagation()}
      >
        <Switch
          id={`auto-update-${name}`}
          checked={autoUpdate}
          onCheckedChange={(checked) =>
            onToggleAutoUpdate(checked, checked ? intervalInput : undefined)
          }
          label="Auto-update"
        />
        {autoUpdate && (
          <div className="flex items-center gap-1.5 text-xs text-(--wb-text-secondary)">
            <input
              type="number"
              min={15}
              value={intervalInput}
              onChange={(e) => {
                const next = Math.max(15, Number(e.target.value) || 15);
                setIntervalInput(next);
                onToggleAutoUpdate(true, next);
              }}
              className="w-14 px-1.5 py-0.5 rounded bg-(--wb-surface-base) border border-(--wb-border-subtle) text-right text-(--wb-text-primary)"
            />
            min
          </div>
        )}
      </div>

      <div className="mt-auto flex items-center justify-end pt-3 border-t border-(--wb-border-subtle)">
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="group active:scale-90 transition-transform"
            icon={
              updateStatus === "updating" ? (
                <ArrowClockwiseRegular className="animate-spin" />
              ) : updateStatus === "success" ? (
                <CheckmarkRegular className="text-(--wb-accent) animate-pop-in" />
              ) : (
                <ArrowClockwiseRegular className="transition-transform duration-500 group-hover:rotate-180" />
              )
            }
            onClick={async (e) => {
              e.stopPropagation();
              if (updateStatus !== "idle") return;
              setUpdateStatus("updating");
              const success = await onUpdate();
              if (success) {
                setUpdateStatus("success");
                setTimeout(() => setUpdateStatus("idle"), 2000);
              } else {
                setUpdateStatus("idle");
              }
            }}
            disabled={updateStatus === "updating"}
            title="Update"
          />
          <Button
            size="sm"
            variant="ghost"
            icon={<OpenRegular />}
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            title="Open in editor"
          />
          <Button
            size="sm"
            variant="ghost"
            icon={<EditRegular />}
            onClick={startEdit}
            title="Edit"
          />
          <Button
            size="sm"
            variant="ghost"
            icon={<DeleteRegular />}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete"
          />
        </div>
      </div>
    </div>
  );
}
