import {
  DismissRegular,
  PinFilled,
  PinRegular,
  TimerRegular,
} from "@fluentui/react-icons";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Flag from "react-flagpack";
import "react-flagpack/dist/style.css";
import { Button } from "../../components/ui/Button";
import { CollapsibleCard } from "../../components/ui/CollapsibleCard";
import { JumpingDots } from "../../components/ui/JumpingDots";
import { PageHeader } from "../../components/ui/PageHeader";
import { Spinner } from "../../components/ui/Spinner";
import { useProxy } from "../../hooks/useProxy";
import { useToast } from "../../hooks/useToast";
import { useExitExpectStore } from "../../stores/exitExpectStore";
import { useProxyStore } from "../../stores/proxyStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSingboxStore } from "../../stores/singboxStore";
import type { ProxyGroupOverview, ProxyNodeOverview } from "../../types/app";

const GROUP_BATCH_SIZE = 12;

function delayColor(delay: number | null): string {
  if (delay === null || delay === undefined) return "text-(--wb-text-disabled)";
  if (delay <= 0) return "text-(--wb-error)";
  if (delay < 200) return "text-(--wb-success)";
  if (delay < 500) return "text-(--wb-accent)";
  return "text-(--wb-warning)";
}

function abbreviateType(type: string | undefined): string {
  if (!type) return "";
  return type
    .replace(/shadowsocks/i, "SS")
    .replace(/hysteria2/i, "Hy2")
    .replace(/hysteria/i, "Hy")
    .replace(/wireguard/i, "WG")
    .toLowerCase();
}

function NodeName({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const parts = [];
  let lastIndex = 0;
  const regex = /[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/g;
  let match;
  while ((match = regex.exec(name)) !== null) {
    if (match.index > lastIndex) {
      parts.push(name.substring(lastIndex, match.index));
    }
    const emoji = match[0];
    const code = [...emoji]
      .map((c) => String.fromCharCode((c.codePointAt(0) ?? 0) - 0x1f1e6 + 65))
      .join("");
    const finalCode = code === "GB" ? "GBR" : code;
    parts.push(
      <Flag
        key={`i-${match.index}`}
        code={finalCode}
        size="s"
        hasBorder={false}
        hasBorderRadius
        hasDropShadow
        gradient="real-linear"
        className="inline-block mx-0.5 translate-y-0.5"
      />,
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < name.length) {
    parts.push(name.substring(lastIndex));
  }
  return (
    <span className={`truncate ${className}`} title={name}>
      {parts}
    </span>
  );
}

interface NodeCardProps {
  node: ProxyNodeOverview;
  selected: boolean;
  /** 这个节点是所在组的期望出口。 */
  pinned: boolean;
  onSelect: () => void;
  onTest: () => void;
  onTogglePin: () => void;
}

const NodeCard = memo(function NodeCard({
  node,
  selected,
  pinned,
  onSelect,
  onTest,
  onTogglePin,
}: NodeCardProps) {
  const isTesting = useProxyStore(
    (s) =>
      s.activeDelayNodes.has(node.name) || s.groupTestingNodes.has(node.name),
  );
  return (
    <div
      onClick={onSelect}
      title={node.name}
      className={[
        "group/node relative flex flex-col items-start gap-1 px-3 py-2 rounded-(--wb-radius-md) overflow-hidden",
        "text-left transition-all duration-200 cursor-pointer w-full min-w-0 border",
        selected
          ? "bg-(--wb-surface-base) border-(--wb-accent)"
          : "bg-(--wb-surface-base) border-(--wb-border-default) hover:bg-(--wb-surface-hover) hover:border-(--wb-border-default)",
      ].join(" ")}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {selected && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.75 h-10 bg-(--wb-accent) rounded-r-full z-10" />
      )}
      <div className="flex w-full justify-between items-start gap-2">
        <NodeName
          name={node.name}
          className="text-xs font-semibold leading-tight text-(--wb-text-primary)"
        />
        {/* 期望出口的图钉：钉住的常显，其余只在悬停时出现。 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          // 别让 Enter/Space 冒泡到卡片上，顺手把节点也切了。
          onKeyDown={(e) => e.stopPropagation()}
          title={
            pinned ? "Unpin expected outbound" : "Pin as expected outbound"
          }
          aria-pressed={pinned}
          className={[
            "shrink-0 -mr-1 -mt-0.5 p-0.5 rounded text-sm leading-none transition-opacity",
            "hover:bg-(--wb-surface-active)",
            pinned
              ? "text-(--wb-accent)"
              : "text-(--wb-text-tertiary) opacity-0 group-hover/node:opacity-100 focus-visible:opacity-100",
          ].join(" ")}
        >
          {pinned ? <PinFilled /> : <PinRegular />}
        </button>
      </div>
      <div className="flex w-full items-center justify-between gap-1 mt-auto pt-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-medium lowercase tracking-wider truncate text-(--wb-text-tertiary)">
            {abbreviateType(node.kind)}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!isTesting) onTest();
          }}
          disabled={isTesting}
          title="Test latency"
          className={[
            "text-xs font-medium tabular-nums rounded px-2 py-0.5 h-5 flex items-center transition-colors border border-transparent",
            isTesting
              ? "opacity-70 cursor-default"
              : "hover:bg-(--wb-surface-active) hover:border-(--wb-border-subtle)",
            delayColor(node.delay),
          ].join(" ")}
        >
          {isTesting ? (
            <JumpingDots className="mx-1" />
          ) : node.delay !== null && node.delay !== undefined ? (
            node.delay <= 0 ? (
              "timeout"
            ) : (
              `${node.delay}ms`
            )
          ) : (
            "--"
          )}
        </button>
      </div>
    </div>
  );
});

interface GroupCardProps {
  group: ProxyGroupOverview;
  isTesting: boolean;
  /** 这个组的期望出口（没设则为 `undefined`）。 */
  expected: string | undefined;
  onSelectNode: (node: string) => void;
  onTestNode: (node: string) => void;
  onTestGroup: () => void;
  onTogglePin: (node: string) => void;
  onClearExpected: () => void;
}

/**
 * 组标题里「Expected」那一行：只在当前节点不是期望节点时出现。
 *
 * 期望节点已经不在组里（订阅更新后改了名）时显示成灰色、给个清除按钮 —— 后端
 * 对这种情况也不提醒，切不回去的东西提醒了没用。
 *
 * 这一行在折叠触发器（一个 `<button>`）里面，所以清除按钮只能是
 * `role="button"` 的 span：按钮套按钮是非法 HTML。
 */
function ExpectedLine({
  group,
  expected,
  onClear,
}: {
  group: ProxyGroupOverview;
  expected: string | undefined;
  onClear: () => void;
}) {
  if (!expected || !group.current || expected === group.current) return null;

  const missing = !group.options.some((node) => node.name === expected);
  if (missing) {
    return (
      <div className="text-xs text-(--wb-text-disabled) mt-1 flex items-center gap-1 min-w-0">
        <PinRegular className="shrink-0" />
        <span className="shrink-0">Expected:</span>
        <NodeName name={expected} />
        <span className="shrink-0">· not in group</span>
        <span
          role="button"
          tabIndex={0}
          title="Clear expected outbound"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onClear();
            }
          }}
          className="shrink-0 p-0.5 rounded leading-none hover:bg-(--wb-surface-active) hover:text-(--wb-text-primary)"
        >
          <DismissRegular />
        </span>
      </div>
    );
  }

  return (
    <div className="text-xs font-medium text-(--wb-warning) mt-1 flex items-center gap-1 min-w-0">
      <PinFilled className="shrink-0" />
      <span className="shrink-0 font-normal">Expected:</span>
      <NodeName name={expected} />
    </div>
  );
}

function GroupTrigger({
  group,
  expected,
  onClearExpected,
}: {
  group: ProxyGroupOverview;
  expected: string | undefined;
  onClearExpected: () => void;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-base font-semibold text-(--wb-text-primary) truncate">
          {group.name}
        </span>
        <span className="text-xs text-(--wb-text-disabled) shrink-0">
          {group.options.length} nodes
        </span>
      </div>
      {group.current && (
        <div className="text-sm font-medium text-(--wb-accent) truncate mt-1 flex items-center gap-1">
          <span className="text-(--wb-text-tertiary) font-normal">Active:</span>
          <NodeName name={group.current} />
        </div>
      )}
      <ExpectedLine
        group={group}
        expected={expected}
        onClear={onClearExpected}
      />
    </div>
  );
}

const GroupCard = memo(function GroupCard({
  group,
  isTesting,
  expected,
  onSelectNode,
  onTestNode,
  onTestGroup,
  onTogglePin,
  onClearExpected,
}: GroupCardProps) {
  const collapsed = useSettingsStore(
    (s) => s.settings.proxies.collapsed_groups[group.name] ?? false,
  );
  const setProxyGroupCollapsed = useSettingsStore(
    (s) => s.setProxyGroupCollapsed,
  );

  return (
    <CollapsibleCard
      open={!collapsed}
      onOpenChange={(open) => void setProxyGroupCollapsed(group.name, !open)}
      className="shadow-sm"
      trigger={
        <div className="flex items-center justify-between gap-3 min-w-0">
          <GroupTrigger
            group={group}
            expected={expected}
            onClearExpected={onClearExpected}
          />
          <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-(--wb-surface-hover) text-(--wb-text-secondary) border border-(--wb-border-subtle)">
            {group.kind}
          </span>
        </div>
      }
      actions={
        <Button
          variant="subtle"
          icon={<TimerRegular />}
          loading={isTesting}
          onClick={onTestGroup}
          title="Test all latencies"
        >
          Test All
        </Button>
      }
    >
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        }}
      >
        {group.options.map((node) => (
          <NodeCard
            key={node.name}
            node={node}
            selected={group.current === node.name}
            pinned={expected === node.name}
            onSelect={() => onSelectNode(node.name)}
            onTest={() => onTestNode(node.name)}
            onTogglePin={() => onTogglePin(node.name)}
          />
        ))}
      </div>
    </CollapsibleCard>
  );
});

const EMPTY_GROUPS: ProxyGroupOverview[] = [];

export default function Proxies() {
  const groups = useProxyStore((s) => s.overview?.proxy_groups) ?? EMPTY_GROUPS;
  const overview = useProxyStore((s) => s.overview);
  const isRunning = useSingboxStore((s) => s.isRunning);

  const activeGroupDelay = useProxyStore((s) => s.activeGroupDelay);
  const {
    refreshOverview,
    switchProxy,
    testDelay,
    testGroupDelay,
    changeMode,
  } = useProxy();

  const exitExpect = useExitExpectStore((s) => s.expect);
  const selectedProfileId = useSettingsStore(
    (s) => s.settings.profiles.selected_profile_id,
  );
  const { error: toastError } = useToast();

  const availableModes = overview?.available_modes ?? [];
  const currentMode = overview?.current_mode ?? "";
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [renderCount, setRenderCount] = useState(GROUP_BATCH_SIZE);

  useEffect(() => {
    void refreshOverview();
  }, [refreshOverview]);

  // 期望出口按档案存，切档案就换一张表。
  useEffect(() => {
    void useExitExpectStore.getState().load(selectedProfileId);
  }, [selectedProfileId]);

  useEffect(() => {
    setRenderCount(Math.min(groups.length, GROUP_BATCH_SIZE));
  }, [groups.length]);

  const visibleGroups = useMemo(
    () => groups.slice(0, renderCount),
    [groups, renderCount],
  );

  const loadMore = useCallback(() => {
    setRenderCount((current) => {
      if (current >= groups.length) return current;
      return Math.min(current + GROUP_BATCH_SIZE, groups.length);
    });
  }, [groups.length]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const threshold = 200;
      const reachedBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <
        threshold;
      if (reachedBottom) {
        loadMore();
      }
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
    };
  }, [loadMore]);

  const handleSelectNode = useCallback(
    async (groupName: string, nodeName: string) => {
      await switchProxy(groupName, nodeName);
    },
    [switchProxy],
  );

  const handleTestNode = useCallback(
    async (nodeName: string) => {
      await testDelay(nodeName);
    },
    [testDelay],
  );

  const handleTogglePin = useCallback(
    async (groupName: string, nodeName: string) => {
      await useExitExpectStore
        .getState()
        .toggle(groupName, nodeName, (msg) => toastError(msg));
    },
    [toastError],
  );

  const handleClearExpected = useCallback(
    async (groupName: string) => {
      await useExitExpectStore
        .getState()
        .clear(groupName, (msg) => toastError(msg));
    },
    [toastError],
  );

  const handleTestGroup = useCallback(
    async (groupName: string) => {
      await testGroupDelay(groupName);
    },
    [testGroupDelay],
  );

  if (!isRunning) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full gap-4 opacity-70">
        <span className="font-semibold text-lg text-(--wb-text-primary)">
          Core is not running
        </span>
        <p className="text-sm font-medium text-(--wb-text-secondary)">
          Please start the core service to view and manage proxies.
        </p>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full gap-4 opacity-70">
        <Spinner size="lg" />
        <p className="text-sm font-medium text-(--wb-text-secondary)">
          Loading routing information...
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      className="flex flex-col h-full overflow-y-auto pr-2 pb-10"
    >
      <PageHeader
        title="Routing"
        description={`${groups.length} proxy groups available. Select your preferred outbound routes.`}
      >
        <div className="flex items-center gap-3">
          {availableModes.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-(--wb-text-secondary) font-medium">
                Mode:
              </span>
              <select
                value={currentMode}
                onChange={(e) => void changeMode(e.target.value)}
                className="px-3 py-1.5 text-sm font-medium rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-layer) text-(--wb-text-primary) outline-none focus:border-(--wb-accent) capitalize"
              >
                {availableModes.map((m) => (
                  <option key={m} value={m}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </PageHeader>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-sm text-(--wb-text-secondary) bg-(--wb-surface-layer) border border-(--wb-border-subtle) rounded-xl shadow-sm">
          No proxy groups configured or loaded.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleGroups.map((group) => (
            <GroupCard
              key={group.name}
              group={group}
              isTesting={activeGroupDelay === group.name}
              expected={exitExpect[group.name]}
              onSelectNode={(node) => void handleSelectNode(group.name, node)}
              onTestNode={(node) => void handleTestNode(node)}
              onTestGroup={() => void handleTestGroup(group.name)}
              onTogglePin={(node) => void handleTogglePin(group.name, node)}
              onClearExpected={() => void handleClearExpected(group.name)}
            />
          ))}
          {renderCount < groups.length && (
            <div className="py-2 text-center text-xs text-(--wb-text-tertiary)">
              Rendering {renderCount} / {groups.length} groups...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
