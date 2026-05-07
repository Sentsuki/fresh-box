import { useEffect, useCallback } from "react";
import {
  ArrowClockwiseRegular,
  TimerRegular,
  ChevronDownRegular,
} from "@fluentui/react-icons";
import { useClashStore } from "../../stores/clashStore";
import { useClash } from "../../hooks/useClash";
import { useSettingsStore } from "../../stores/settingsStore";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import type { ClashProxyGroup, ClashProxyNode } from "../../types/app";

function delayColor(delay: number | null): string {
  if (!delay) return "text-[var(--wb-text-disabled)]";
  if (delay < 200) return "text-[#6BB44A]";
  if (delay < 500) return "text-[#D4A017]";
  return "text-[#E05252]";
}

function DelayLabel({ delay }: { delay: number | null }) {
  if (!delay)
    return <span className="text-[10px] text-[var(--wb-text-disabled)]">--</span>;
  return (
    <span className={`text-[10px] tabular-nums ${delayColor(delay)}`}>
      {delay}ms
    </span>
  );
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

function NodeCard({ node, selected, onSelect, onTest }: NodeCardProps) {
  return (
    <button
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        onTest();
      }}
      title={node.name}
      className={[
        "flex flex-col items-start gap-1.5 px-2 py-2 rounded-[var(--wb-radius-md)]",
        "text-left transition-all duration-100 cursor-pointer w-full min-w-0",
        selected
          ? "bg-[var(--wb-accent)] text-white shadow-sm"
          : "bg-[var(--wb-surface-base)] hover:bg-[var(--wb-surface-hover)] text-[var(--wb-text-primary)]",
      ].join(" ")}
    >
      <span
        className={`w-full truncate text-xs font-medium leading-tight ${
          selected ? "text-white" : "text-[var(--wb-text-primary)]"
        }`}
      >
        {node.name}
      </span>
      <div className="flex w-full items-center justify-between gap-1">
        <span
          className={`text-[10px] truncate ${
            selected ? "text-white/70" : "text-[var(--wb-text-tertiary)]"
          }`}
        >
          {abbreviateType(node.type)}
        </span>
        <DelayLabel delay={node.delay} />
      </div>
    </button>
  );
}

interface GroupCardProps {
  group: ClashProxyGroup;
  onSelectNode: (node: string) => void;
  onTestNode: (node: string) => void;
  onTestGroup: () => void;
}

function GroupCard({ group, onSelectNode, onTestNode, onTestGroup }: GroupCardProps) {
  const collapsedGroups = useSettingsStore((s) => s.settings.pages.proxies.collapsed_groups);
  const setProxyGroupCollapsed = useSettingsStore((s) => s.setProxyGroupCollapsed);
  const open = !(collapsedGroups[group.name] ?? false);
  const toggleOpen = () => void setProxyGroupCollapsed(group.name, open);

  return (
    <div className="rounded-[var(--wb-radius-lg)] border border-[var(--wb-border-subtle)] bg-[var(--wb-surface-layer)] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => toggleOpen()}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--wb-surface-hover)] transition-colors"
      >
        <ChevronDownRegular
          className={`text-[var(--wb-text-secondary)] transition-transform duration-200 flex-shrink-0 ${
            open ? "rotate-0" : "-rotate-90"
          }`}
        />
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--wb-text-primary)] truncate">
              {group.name}
            </span>
            <span className="text-xs text-[var(--wb-text-tertiary)] flex-shrink-0">
              {group.type}
            </span>
            <span className="text-xs text-[var(--wb-text-disabled)] flex-shrink-0">
              · {group.options.length}
            </span>
          </div>
          {group.now && (
            <div className="text-xs text-[var(--wb-accent)] truncate mt-0.5">
              → {group.now}
            </div>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTestGroup();
          }}
          className="flex-shrink-0 p-1.5 rounded-[var(--wb-radius-sm)] text-[var(--wb-text-secondary)] hover:text-[var(--wb-text-primary)] hover:bg-[var(--wb-surface-active)] transition-colors"
          title="Test all latencies"
        >
          <TimerRegular className="text-sm" />
        </button>
      </button>

      {/* Node grid */}
      {open && (
        <div className="px-3 pb-3">
          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns:
                "repeat(auto-fill, minmax(min(140px, 100%), 1fr))",
            }}
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
}

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
        <p className="text-sm text-[var(--wb-text-secondary)]">Loading proxies...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--wb-text-primary)]">Proxies</h1>
          <p className="text-sm text-[var(--wb-text-secondary)] mt-0.5">
            {groups.length} groups · {overview.current_mode}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {availableModes.length > 0 && (
            <select
              value={currentMode}
              onChange={(e) => void changeMode(e.target.value)}
              className="px-2 py-1 text-sm rounded-[var(--wb-radius-md)] border border-[var(--wb-border-default)] bg-[var(--wb-surface-layer)] text-[var(--wb-text-primary)] outline-none focus:border-[var(--wb-accent)] capitalize"
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
        <div className="flex flex-col items-center justify-center h-32 text-sm text-[var(--wb-text-secondary)]">
          No proxy groups found
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <GroupCard
              key={group.name}
              group={group}
              onSelectNode={(node) =>
                void handleSelectNode(group.name, node)
              }
              onTestNode={(node) => void handleTestNode(node)}
              onTestGroup={() => void handleTestGroup(group.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
