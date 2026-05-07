import { useEffect, useCallback, memo } from "react";
import {
  ArrowClockwiseRegular,
  ChevronDownRegular,
  TimerRegular,
  CheckmarkCircleFilled,
} from "@fluentui/react-icons";
import { useClashStore } from "../../stores/clashStore";
import { useClash } from "../../hooks/useClash";
import { useSettingsStore } from "../../stores/settingsStore";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import type { ClashProxyGroup, ClashProxyNode } from "../../types/app";

function delayColor(delay: number | null): string {
  if (!delay) return "text-(--wb-text-disabled)";
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

interface NodeCardProps {
  node: ClashProxyNode;
  selected: boolean;
  onSelect: () => void;
  onTest: () => void;
}

const NodeCard = memo(function NodeCard({ node, selected, onSelect, onTest }: NodeCardProps) {
  return (
    <button
      onClick={onSelect}
      title={node.name}
      className={[
        "relative flex flex-col items-start gap-1.5 px-3 py-2.5 rounded-(--wb-radius-md)",
        "text-left transition-all duration-100 cursor-pointer w-full min-w-0 border",
        selected
          ? "bg-(--wb-surface-selected) border-(--wb-accent) shadow-sm"
          : "bg-(--wb-surface-base) border-(--wb-border-subtle) hover:bg-(--wb-surface-hover)",
      ].join(" ")}
    >
      <div className="flex w-full justify-between items-start gap-2">
        <span
          className={`truncate text-sm font-medium leading-tight ${
            selected ? "text-(--wb-accent)" : "text-(--wb-text-primary)"
          }`}
        >
          {node.name}
        </span>
        {selected && (
          <CheckmarkCircleFilled className="text-(--wb-accent) flex-shrink-0 text-base" />
        )}
      </div>
      <div className="flex w-full items-center justify-between gap-1 mt-auto">
        <span className="text-xs truncate text-(--wb-text-tertiary)">
          {abbreviateType(node.type)}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTest();
          }}
          title="Test latency"
          className={`text-xs tabular-nums rounded px-1.5 py-0.5 transition-colors ${
            delayColor(node.delay)
          } hover:bg-(--wb-surface-active)`}
        >
          {node.delay ? `${node.delay}ms` : "--"}
        </button>
      </div>
    </button>
  );
});

interface GroupCardProps {
  group: ClashProxyGroup;
  onSelectNode: (node: string) => void;
  onTestNode: (node: string) => void;
  onTestGroup: () => void;
}

function GroupTrigger({ group }: { group: ClashProxyGroup }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-(--wb-text-primary) truncate">
          {group.name}
        </span>
        <span className="text-xs text-(--wb-text-tertiary) flex-shrink-0">
          {group.type}
        </span>
        <span className="text-xs text-(--wb-text-disabled) flex-shrink-0">
          · {group.options.length}
        </span>
      </div>
      {group.now && (
        <div className="text-xs text-(--wb-accent) truncate mt-0.5">
          → {group.now}
        </div>
      )}
    </div>
  );
}

const GroupCard = memo(function GroupCard({ group, onSelectNode, onTestNode, onTestGroup }: GroupCardProps) {
  const collapsed = useSettingsStore((s) => s.settings.pages.proxies.collapsed_groups[group.name] ?? false);
  const setProxyGroupCollapsed = useSettingsStore((s) => s.setProxyGroupCollapsed);
  const open = !collapsed;

  return (
    <div className="rounded-(--wb-radius-md) border border-(--wb-border-subtle) bg-(--wb-surface-layer) overflow-hidden shadow-sm">
      <div className="flex items-center">
        <button
          onClick={() => void setProxyGroupCollapsed(group.name, open)}
          className={[
            "flex flex-1 items-center justify-between px-4 py-3 min-w-0",
            "bg-(--wb-surface-layer) hover:bg-(--wb-surface-hover)",
            "transition-colors duration-100 text-left",
          ].join(" ")}
        >
          <span className="flex-1 min-w-0">
            <GroupTrigger group={group} />
          </span>
          <ChevronDownRegular
            className={`ml-2 flex-shrink-0 text-(--wb-text-secondary) transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          />
        </button>
        <div className="flex-shrink-0 px-2 bg-(--wb-surface-layer)">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTestGroup();
            }}
            className="p-1.5 rounded-(--wb-radius-sm) text-(--wb-text-secondary) hover:text-(--wb-text-primary) hover:bg-(--wb-surface-active) transition-colors"
            title="Test all latencies"
          >
            <TimerRegular className="text-sm" />
          </button>
        </div>
      </div>
      {open && (
        <div className="px-4 py-4 bg-(--wb-surface-base) border-t border-(--wb-border-subtle)">
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
          >
            {group.options.map((node) => (
              <NodeCard
                key={node.name}
                node={node}
                selected={group.now === node.name}
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

export default function Proxies() {
  const groups = useClashStore((s) => s.overview?.proxy_groups ?? []);
  const overview = useClashStore((s) => s.overview);
  const { refreshOverview, switchProxy, testDelay, testGroupDelay, changeMode } = useClash();

  const availableModes = overview?.available_modes ?? [];
  const currentMode = overview?.current_mode ?? "";

  useEffect(() => {
    void refreshOverview();
  }, [refreshOverview]);

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

  if (!overview) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <Spinner />
        <p className="text-sm text-(--wb-text-secondary)">Loading proxies...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-(--wb-text-primary)">Proxies</h1>
          <p className="text-sm text-(--wb-text-secondary) mt-0.5">
            {groups.length} groups · {overview.current_mode}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {availableModes.length > 0 && (
            <select
              value={currentMode}
              onChange={(e) => void changeMode(e.target.value)}
              className="px-2 py-1 text-sm rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-layer) text-(--wb-text-primary) outline-none focus:border-(--wb-accent) capitalize"
            >
              {availableModes.map((m) => (
                <option key={m} value={m}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </option>
              ))}
            </select>
          )}
          <Button
            icon={<ArrowClockwiseRegular />}
            variant="subtle"
            onClick={() => void refreshOverview()}
          >
            Refresh
          </Button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-sm text-(--wb-text-secondary)">
          No proxy groups found
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((group) => (
            <GroupCard
              key={group.name}
              group={group}
              onSelectNode={(node) => void handleSelectNode(group.name, node)}
              onTestNode={(node) => void handleTestNode(node)}
              onTestGroup={() => void handleTestGroup(group.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
