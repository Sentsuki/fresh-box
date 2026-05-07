import { useEffect, useCallback } from "react";
import {
  ArrowClockwiseRegular,
  TimerRegular,
} from "@fluentui/react-icons";
import { useClashStore } from "../../stores/clashStore";
import { useClash } from "../../hooks/useClash";
import { useSettingsStore } from "../../stores/settingsStore";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import { Accordion, AccordionItem } from "../../components/ui/Accordion";
import type { ClashProxyGroup, ClashProxyNode } from "../../types/app";

function delayColor(delay: number | null): string {
  if (!delay) return "text-[var(--wb-text-disabled)]";
  if (delay < 200) return "text-[var(--wb-success)]";
  if (delay < 500) return "text-[var(--wb-warning)]";
  return "text-[var(--wb-error)]";
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
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTest();
          }}
          title="Test latency"
          className={`text-[10px] tabular-nums rounded px-1 transition-colors ${
            selected
              ? "text-white/80 hover:text-white hover:bg-white/20"
              : `${delayColor(node.delay)} hover:bg-[var(--wb-surface-active)]`
          }`}
        >
          {node.delay ? `${node.delay}ms` : "--"}
        </button>
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

function GroupTrigger({ group }: { group: ClashProxyGroup }) {
  return (
    <div className="flex-1 min-w-0">
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
  );
}

function GroupCard({ group, onSelectNode, onTestNode, onTestGroup }: GroupCardProps) {
  return (
    <AccordionItem
      value={group.name}
      trigger={<GroupTrigger group={group} />}
      actions={
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTestGroup();
          }}
          className="p-1.5 rounded-[var(--wb-radius-sm)] text-[var(--wb-text-secondary)] hover:text-[var(--wb-text-primary)] hover:bg-[var(--wb-surface-active)] transition-colors"
          title="Test all latencies"
        >
          <TimerRegular className="text-sm" />
        </button>
      }
    >
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(140px, 100%), 1fr))" }}
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
    </AccordionItem>
  );
}

export default function Proxies() {
  const groups = useClashStore((s) => s.overview?.proxy_groups ?? []);
  const overview = useClashStore((s) => s.overview);
  const { refreshOverview, switchProxy, testDelay, testGroupDelay, changeMode } = useClash();
  const collapsedGroups = useSettingsStore((s) => s.settings.pages.proxies.collapsed_groups);
  const setProxyGroupCollapsed = useSettingsStore((s) => s.setProxyGroupCollapsed);

  const availableModes = overview?.available_modes ?? [];
  const currentMode = overview?.current_mode ?? "";

  // Compute the list of open (non-collapsed) accordion values
  const openGroups = groups
    .filter((g) => !(collapsedGroups[g.name] ?? false))
    .map((g) => g.name);

  const handleAccordionChange = useCallback(
    (newOpen: string[]) => {
      for (const g of groups) {
        const wasOpen = openGroups.includes(g.name);
        const isNowOpen = newOpen.includes(g.name);
        if (wasOpen !== isNowOpen) {
          void setProxyGroupCollapsed(g.name, !isNowOpen);
        }
      }
    },
    [groups, openGroups, setProxyGroupCollapsed],
  );

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
        <Accordion
          type="multiple"
          value={openGroups}
          onValueChange={handleAccordionChange as (v: string | string[]) => void}
        >
          {groups.map((group) => (
            <GroupCard
              key={group.name}
              group={group}
              onSelectNode={(node) => void handleSelectNode(group.name, node)}
              onTestNode={(node) => void handleTestNode(node)}
              onTestGroup={() => void handleTestGroup(group.name)}
            />
          ))}
        </Accordion>
      )}
    </div>
  );
}
