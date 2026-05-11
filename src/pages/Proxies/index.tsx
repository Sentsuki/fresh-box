import {
  ArrowClockwiseRegular,
  ChevronDownRegular,
  TimerRegular,
} from "@fluentui/react-icons";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { JumpingDots } from "../../components/ui/JumpingDots";
import { PageHeader } from "../../components/ui/PageHeader";
import { Spinner } from "../../components/ui/Spinner";
import { useClash } from "../../hooks/useClash";
import { useClashStore } from "../../stores/clashStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSingboxStore } from "../../stores/singboxStore";
import type { ClashProxyGroup, ClashProxyNode } from "../../types/app";

const GROUP_BATCH_SIZE = 12;

function delayColor(delay: number | null): string {
  if (delay === null || delay === undefined) return "text-(--wb-text-disabled)";
  if (delay <= 0) return "text-(--wb-error)";
  if (delay < 200) return "text-(--wb-success)";
  if (delay < 500) return "text-(--wb-warning)";
  return "text-(--wb-error)";
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
      .map((c) => String.fromCharCode((c.codePointAt(0) ?? 0) - 0x1f1e6 + 97))
      .join("");
    parts.push(
      <img
        key={`i-${match.index}`}
        src={`https://flagcdn.com/256x192/${code}.png`}
        alt={emoji}
        className="inline-block w-[18px] h-[13px] mx-0.5 rounded-[2px] object-cover -translate-y-px"
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
  node: ClashProxyNode;
  selected: boolean;
  onSelect: () => void;
  onTest: () => void;
}

const NodeCard = memo(function NodeCard({
  node,
  selected,
  onSelect,
  onTest,
}: NodeCardProps) {
  const isTesting = useClashStore(
    (s) =>
      s.activeDelayNodes.has(node.name) || s.groupTestingNodes.has(node.name),
  );
  return (
    <div
      onClick={onSelect}
      title={node.name}
      className={[
        "relative flex flex-col items-start gap-1 px-3 py-2 rounded-(--wb-radius-md) overflow-hidden",
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
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-10 bg-(--wb-accent) rounded-r-full z-10" />
      )}
      <div className="flex w-full justify-between items-start gap-2">
        <NodeName
          name={node.name}
          className="text-xs font-semibold leading-tight text-(--wb-text-primary)"
        />
      </div>
      <div className="flex w-full items-center justify-between gap-1 mt-auto pt-1">
        <span className="text-xs font-medium uppercase tracking-wider truncate text-(--wb-text-tertiary)">
          {abbreviateType(node.kind)}
        </span>
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
  group: ClashProxyGroup;
  isTesting: boolean;
  onSelectNode: (node: string) => void;
  onTestNode: (node: string) => void;
  onTestGroup: () => void;
}

function GroupTrigger({ group }: { group: ClashProxyGroup }) {
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
    </div>
  );
}

const GroupCard = memo(function GroupCard({
  group,
  isTesting,
  onSelectNode,
  onTestNode,
  onTestGroup,
}: GroupCardProps) {
  const collapsed = useSettingsStore(
    (s) => s.settings.proxies.collapsed_groups[group.name] ?? false,
  );
  const setProxyGroupCollapsed = useSettingsStore(
    (s) => s.setProxyGroupCollapsed,
  );
  const open = !collapsed;

  return (
    <div className="rounded-xl border border-(--wb-border-subtle) bg-(--wb-surface-layer) overflow-hidden shadow-sm transition-all duration-300">
      <div className="flex items-center">
        <button
          onClick={() => void setProxyGroupCollapsed(group.name, open)}
          className={[
            "flex flex-1 items-center justify-between px-4 py-3 min-w-0",
            "bg-transparent hover:bg-(--wb-surface-hover)",
            "transition-colors duration-150 text-left",
          ].join(" ")}
        >
          <span className="flex-1 min-w-0">
            <GroupTrigger group={group} />
          </span>
          <div className="flex items-center gap-3 ml-4 shrink-0">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-(--wb-surface-hover) text-(--wb-text-secondary) border border-(--wb-border-subtle)">
              {group.kind}
            </span>
            <ChevronDownRegular
              className={`text-xl text-(--wb-text-secondary) transition-transform duration-300 ${open ? "rotate-180" : ""}`}
            />
          </div>
        </button>
        <div className="shrink-0 px-3 bg-transparent border-l border-(--wb-border-subtle) h-full flex items-center">
          <Button
            variant="subtle"
            icon={<TimerRegular />}
            loading={isTesting}
            onClick={(e) => {
              e.stopPropagation();
              onTestGroup();
            }}
            title="Test all latencies"
          >
            Test All
          </Button>
        </div>
      </div>
      {open && (
        <div className="p-4 bg-(--wb-surface-base) border-t border-(--wb-border-subtle)">
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
                onSelect={() => onSelectNode(node.name)}
                onTest={() => onTestNode(node.name)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

const EMPTY_GROUPS: ClashProxyGroup[] = [];

export default function Proxies() {
  const groups = useClashStore((s) => s.overview?.proxy_groups) ?? EMPTY_GROUPS;
  const overview = useClashStore((s) => s.overview);
  const isRunning = useSingboxStore((s) => s.isRunning);
  const isRefreshing = useClashStore((s) => s.isRefreshing);
  const activeGroupDelay = useClashStore((s) => s.activeGroupDelay);
  const {
    refreshOverview,
    switchProxy,
    testDelay,
    testGroupDelay,
    changeMode,
  } = useClash();

  const availableModes = overview?.available_modes ?? [];
  const currentMode = overview?.current_mode ?? "";
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [renderCount, setRenderCount] = useState(GROUP_BATCH_SIZE);

  useEffect(() => {
    void refreshOverview();
  }, [refreshOverview]);

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
                className="px-3 py-1.5 text-sm font-medium rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-layer) text-(--wb-text-primary) outline-none focus:border-(--wb-accent) capitalize shadow-sm"
              >
                {availableModes.map((m) => (
                  <option key={m} value={m}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Button
            icon={<ArrowClockwiseRegular />}
            variant="accent"
            loading={isRefreshing}
            onClick={() => void refreshOverview()}
          >
            Refresh
          </Button>
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
              onSelectNode={(node) => void handleSelectNode(group.name, node)}
              onTestNode={(node) => void handleTestNode(node)}
              onTestGroup={() => void handleTestGroup(group.name)}
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
