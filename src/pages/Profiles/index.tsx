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
  ShareRegular,
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
import {
  DEFAULT_AUTO_UPDATE_INTERVAL_MINUTES,
  type ProfileEntry,
} from "../../types/app";

/** 自动更新间隔的下限（分钟）。 */
const MIN_AUTO_UPDATE_INTERVAL_MINUTES = 15;

export default function Profiles() {
  const profiles = useConfigStore((s) => s.profiles);
  const selectedProfileId = useSettingsStore(
    (s) => s.settings.profiles.selected_profile_id,
  );
  const pendingOperation = useConfigStore((s) => s.pendingOperation);

  const [isAddSubOpen, setIsAddSubOpen] = useState(false);
  const [newSubUrl, setNewSubUrl] = useState("");
  const [urlError, setUrlError] = useState("");

  const {
    initializeConfigs,
    selectConfig,
    selectConfigFile,
    selectProfileFile,
    exportProfileFile,
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

  /** 名字和地址分两条命令存，只发真正改了的那条。 */
  async function saveEdits(
    profile: ProfileEntry,
    name: string,
    url: string | null,
  ) {
    if (name && name !== profile.name) await renameConfig(profile.id, name);
    if (url && url !== profile.url) await editSubscription(profile.id, url);
  }

  const renderCard = (profile: ProfileEntry) => (
    <ProfileCard
      key={profile.id}
      profile={profile}
      selected={selectedProfileId === profile.id}
      onSelect={() => void selectConfig(profile)}
      onOpen={() => void openConfigFile(profile.id)}
      onDelete={() => void deleteConfig(profile.id)}
      onExport={() => void exportProfileFile(profile.id, profile.name)}
      onSave={(name, url) => void saveEdits(profile, name, url)}
      onUpdate={() => updateSubscription(profile.id)}
      onSetAutoUpdate={(enabled, minutes) =>
        void setAutoUpdate(profile.id, enabled, minutes)
      }
    />
  );

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
          icon={<ShareRegular />}
          variant="subtle"
          onClick={() => void selectProfileFile()}
          title="Import a .bpf profile shared from another sing-box client"
        >
          Import Shared
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
          <ProfileGrid
            profiles={subscriptionFiles}
            emptyHint='No subscriptions. Click "Add Subscription" to add one.'
            renderCard={renderCard}
          />
        </SettingGroup>

        <SettingGroup title="Local Files">
          <ProfileGrid
            profiles={localFiles}
            emptyHint='No local config files. Click "Import Local" to add one.'
            renderCard={renderCard}
          />
        </SettingGroup>
      </div>
    </div>
  );
}

function ProfileGrid({
  profiles,
  emptyHint,
  renderCard,
}: {
  profiles: ProfileEntry[];
  emptyHint: string;
  renderCard: (profile: ProfileEntry) => React.ReactNode;
}) {
  if (profiles.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-(--wb-text-secondary) bg-(--wb-surface-layer) border border-(--wb-border-subtle) rounded-(--wb-radius-md) shadow-sm">
        {emptyHint}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {profiles.map(renderCard)}
    </div>
  );
}

interface ProfileCardProps {
  profile: ProfileEntry;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onExport: () => void;
  /** 编辑表单的保存。本地文件没有地址，`url` 恒为 `null`。 */
  onSave: (name: string, url: string | null) => void;
  /** 下面两个只有订阅才会用到。 */
  onUpdate: () => Promise<boolean>;
  onSetAutoUpdate: (enabled: boolean, intervalMinutes?: number) => void;
}

/**
 * 一份配置的卡片。本地文件和订阅共用：订阅只是多出地址、更新时间、自动
 * 更新这一行和「立即更新」按钮，编辑时多一个地址输入框。
 */
function ProfileCard({
  profile,
  selected,
  onSelect,
  onOpen,
  onDelete,
  onExport,
  onSave,
  onUpdate,
  onSetAutoUpdate,
}: ProfileCardProps) {
  const [editing, setEditing] = useState(false);
  const isSubscription = !!profile.url;

  if (editing) {
    return (
      <ProfileEditForm
        profile={profile}
        onCancel={() => setEditing(false)}
        onSave={(name, url) => {
          onSave(name, url);
          setEditing(false);
        }}
      />
    );
  }

  const Icon = isSubscription ? CloudArrowDownRegular : DocumentRegular;

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
          <Icon className="text-xl" />
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          {/* 阶段 4 起内容文件按 UUID 命名，路径对用户没有信息量了
              （`...\profiles3f2....json`），所以本地文件不显示路径 —— 要看
              内容点「打开配置文件」。 */}
          <p className="text-sm font-semibold truncate text-(--wb-text-primary)">
            {profile.name}
          </p>
          {isSubscription && (
            <>
              <p
                className="text-xs text-(--wb-text-tertiary) truncate mt-0.5"
                title={profile.url ?? undefined}
              >
                {profile.url}
              </p>
              {profile.lastUpdated && (
                <p className="text-[10px] font-medium text-(--wb-text-disabled) mt-1.5 uppercase tracking-wide">
                  Updated {formatLastUpdated(profile.lastUpdated)}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {isSubscription && (
        <AutoUpdateRow profile={profile} onSetAutoUpdate={onSetAutoUpdate} />
      )}

      <div className="mt-auto flex items-center justify-end pt-3 border-t border-(--wb-border-subtle)">
        <div className="flex gap-1">
          {isSubscription && <UpdateButton onUpdate={onUpdate} />}
          <CardAction
            icon={<OpenRegular />}
            title="Open in editor"
            onClick={onOpen}
          />
          <CardAction
            icon={<EditRegular />}
            title={isSubscription ? "Edit" : "Rename"}
            onClick={() => setEditing(true)}
          />
          <CardAction
            icon={<ShareRegular />}
            title="Export as a shareable .bpf file"
            onClick={onExport}
          />
          <CardAction
            icon={<DeleteRegular />}
            title="Delete"
            onClick={onDelete}
          />
        </div>
      </div>
    </div>
  );
}

/** 卡片底部的图标按钮。点击不冒泡，否则会顺带把这份配置选中。 */
function CardAction({
  icon,
  title,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={icon}
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    />
  );
}

/** 编辑表单。每次进入编辑都是新挂载，所以初值直接取当前的名字和地址。 */
function ProfileEditForm({
  profile,
  onCancel,
  onSave,
}: {
  profile: ProfileEntry;
  onCancel: () => void;
  onSave: (name: string, url: string | null) => void;
}) {
  const isSubscription = !!profile.url;
  const [nameInput, setNameInput] = useState(profile.name);
  const [urlInput, setUrlInput] = useState(profile.url ?? "");

  const save = () =>
    onSave(nameInput.trim(), isSubscription ? urlInput.trim() : null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") save();
    else if (e.key === "Escape") onCancel();
  };

  return (
    <div className="flex flex-col gap-3 p-4 rounded-(--wb-radius-md) border border-(--wb-border-subtle) bg-(--wb-surface-layer) shadow-sm">
      <Input
        label="Name"
        autoFocus
        value={nameInput}
        onChange={(e) => setNameInput(e.target.value)}
        onKeyDown={handleKeyDown}
        leftIcon={<EditRegular />}
      />
      {isSubscription && (
        <Input
          label="Subscription URL"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="https://..."
          leftIcon={<LinkRegular />}
        />
      )}
      <div className="flex gap-2 justify-end mt-1">
        <Button
          size="sm"
          variant="ghost"
          icon={<DismissRegular />}
          onClick={onCancel}
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

function AutoUpdateRow({
  profile,
  onSetAutoUpdate,
}: {
  profile: ProfileEntry;
  onSetAutoUpdate: (enabled: boolean, intervalMinutes?: number) => void;
}) {
  const interval =
    profile.updateIntervalMinutes ?? DEFAULT_AUTO_UPDATE_INTERVAL_MINUTES;
  // 输入中的草稿是字符串，失焦或回车时才钳到下限并保存 —— 逐键钳的话，清空
  // 后想敲 "60"，第一个 "6" 就被顶成 15，再敲 "0" 成了 150；而且每敲一键
  // 都是一次后端写入。
  const [intervalDraft, setIntervalDraft] = useState<string | null>(null);

  function commitInterval() {
    if (intervalDraft === null) return;
    const next = Math.max(
      MIN_AUTO_UPDATE_INTERVAL_MINUTES,
      Math.round(Number(intervalDraft)) || MIN_AUTO_UPDATE_INTERVAL_MINUTES,
    );
    setIntervalDraft(null);
    if (next !== interval) onSetAutoUpdate(true, next);
  }

  return (
    <div
      className="flex items-center justify-between gap-2 py-1"
      onClick={(e) => e.stopPropagation()}
    >
      <Switch
        id={`auto-update-${profile.id}`}
        checked={profile.autoUpdate}
        onCheckedChange={(checked) =>
          onSetAutoUpdate(checked, checked ? interval : undefined)
        }
        label="Auto-update"
      />
      {profile.autoUpdate && (
        <div className="flex items-center gap-1.5 text-xs text-(--wb-text-secondary)">
          <input
            type="number"
            min={MIN_AUTO_UPDATE_INTERVAL_MINUTES}
            value={intervalDraft ?? String(interval)}
            onChange={(e) => setIntervalDraft(e.target.value)}
            onBlur={commitInterval}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitInterval();
              else if (e.key === "Escape") setIntervalDraft(null);
            }}
            className="w-14 px-1.5 py-0.5 rounded bg-(--wb-surface-base) border border-(--wb-border-subtle) text-right text-(--wb-text-primary)"
          />
          min
        </div>
      )}
    </div>
  );
}

/** 「立即更新」：转圈 → 成功打勾两秒 → 复位；失败直接复位（错误由 toast 报）。 */
function UpdateButton({ onUpdate }: { onUpdate: () => Promise<boolean> }) {
  const [status, setStatus] = useState<"idle" | "updating" | "success">("idle");

  return (
    <Button
      size="sm"
      variant="ghost"
      className="active:scale-90 transition-transform"
      icon={
        status === "updating" ? (
          <ArrowClockwiseRegular className="animate-spin" />
        ) : status === "success" ? (
          <CheckmarkRegular className="text-(--wb-accent) animate-pop-in" />
        ) : (
          <ArrowClockwiseRegular />
        )
      }
      onClick={async (e) => {
        e.stopPropagation();
        if (status !== "idle") return;
        setStatus("updating");
        if (await onUpdate()) {
          setStatus("success");
          setTimeout(() => setStatus("idle"), 2000);
        } else {
          setStatus("idle");
        }
      }}
      disabled={status === "updating"}
      title="Update"
      aria-label="Update"
    />
  );
}
