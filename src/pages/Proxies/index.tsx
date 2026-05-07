import { useEffect, useCallback, memo } from "react";
import {
  ArrowClockwiseRegular,
  ChevronDownRegular,
  TimerRegular,
  GlobeRegular,
} from "@fluentui/react-icons";
import { useClashStore } from "../../stores/clashStore";
import { useClash } from "../../hooks/useClash";
import { useSettingsStore } from "../../stores/settingsStore";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import { Badge } from "../../components/ui/Badge";
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
        "relative flex flex-col items-start gap-1 px-3 py-2.5 rounded-(--wb-radius-md)",
        "text-left transition-all duration-75 cursor-pointer w-full min-w-0 border",
        selected
          ? "bg-(--wb-surface-selected) border-(--wb-accent) ring-1 ring-(--wb-accent)/10 shadow-sm"
          : "bg-(--wb-surface-layer-alt) hover:bg-(--wb-surface-hover) border-(--wb-border-subtle) text-(--wb-text-primary)",
      ].join(" ")}
    >
      {selected && (
        <span className="absolute left-0 top-2 bottom-2 w-1 bg-(--wb-accent) rounded-r-full" />
      )}
      <span
        className={`w-full truncate text-sm font-medium leading-tight ${
          selected ? "text-(--wb-text-primary)" : "text-(--wb-text-primary)"
        }`}
      >
        {node.name}
      </span>
      <div className="flex w-full items-center justify-between gap-1 mt-1">
        <span
          className={`text-[11px] font-medium uppercase tracking-wider ${
            selected ? "text-(--wb-accent)" : "text-(--wb-text-tertiary)"
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
          className={`text-[11px] tabular-nums font-semibold rounded px-1.5 py-0.5 transition-colors ${
            selected
              ? "bg-(--wb-accent)/10 text-(--wb-accent) hover:bg-(--wb-accent)/20"
              : `${delayColor(node.delay)} bg-(--wb-surface-active) hover:bg-(--wb-surface-selected)`
          }`}
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

const GroupCard = memo(function GroupCard({ group, onSelectNode, onTestNode, onTestGroup }: GroupCardProps) {
  const collapsed = useSettingsStore((s) => s.settings.pages.proxies.collapsed_groups[group.name] ?? false);
  const setProxyGroupCollapsed = useSettingsStore((s) => s.setProxyGroupCollapsed);
  const open = !collapsed;

  return (
    <div className="rounded-(--wb-radius-lg) border border-(--wb-border-subtle) bg-(--wb-surface-layer) overflow-hidden shadow-sm">
      <div className="flex items-center">
        <button
          onClick={() => void setProxyGroupCollapsed(group.name, open)}
          className={[
            "flex flex-1 items-center justify-between px-5 py-4 min-w-0",
            "hover:bg-(--wb-surface-hover) active:bg-(--wb-surface-active)",
            "transition-colors duration-100 text-left",
          ].join(" ")}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-(--wb-text-primary) truncate">
                {group.name}
              </span>
              <Badge variant="subtle" className="text-[10px] uppercase tracking-tighter">
                {group.type}
              </Badge>
              <span className="text-xs text-(--wb-text-tertiary) shrink-0">
                ({group.options.length} nodes)
              </span>
            </div>
            {group.now && (
              <div className="text-xs text-(--wb-accent) font-medium truncate mt-1 flex items-center gap-1">
                <GlobeRegular className="text-xs" />
                {group.now}
              </div>
            )}
          </div>
          <ChevronDownRegular
            className={`ml-4 shrink-0 text-(--wb-text-tertiary) transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
        <div className="shrink-0 px-3 flex items-center border-l border-(--wb-border-subtle) h-12 my-2">
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onTestGroup();
            }}
            variant="subtle"
            size="sm"
            title="Test all nodes"
            icon={<TimerRegular className="text-base" />}
          />
        </div>
      </div>
      {open && (
        <div className="px-5 py-4 bg-(--wb-surface-layer-alt)/30 border-t border-(--wb-border-subtle)">
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(160px, 100%), 1fr))" }}
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
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Spinner size="lg" />
        <p className="text-sm font-medium text-(--wb-text-secondary)">Loading proxies...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-(--wb-text-primary) tracking-tight">Proxies</h1>
          <p className="text-sm text-(--wb-text-secondary) mt-1">
            {groups.length} groups · Mode: <span className="font-semibold text-(--wb-accent) capitalize">{currentMode}</span>
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {availableModes.length > 0 && (
            <div className="flex items-center gap-2 bg-(--wb-surface-layer) border border-(--wb-border-subtle) rounded-(--wb-radius-md) p-1">
              {availableModes.map((m) => (
                <button
                  key={m}
                  onClick={() => void changeMode(m)}
                  className={[
                    "px-3 py-1 text-xs font-medium rounded-(--wb-radius-sm) transition-all capitalize",
                    currentMode === m
                      ? "bg-(--wb-accent) text-(--wb-accent-fg) shadow-sm"
                      : "text-(--wb-text-secondary) hover:bg-(--wb-surface-hover) hover:text-(--wb-text-primary)"
                  ].join(" ")}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
          <Button
            icon={<ArrowClockwiseRegular />}
            variant="default"
            size="md"
            onClick={() => void refreshOverview()}
          >
            Refresh
          </Button>
        </div>
      </header>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-(--wb-surface-layer) rounded-(--wb-radius-lg) border border-dashed border-(--wb-border-subtle)">
          <GlobeRegular className="text-4xl text-(--wb-text-disabled) mb-2" />
          <p className="text-sm font-medium text-(--wb-text-secondary)">No proxy groups found</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
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

