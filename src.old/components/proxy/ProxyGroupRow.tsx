import { useCallback } from "react";
import {
  Text,
  Badge,
  Spinner,
  Button,
} from "@fluentui/react-components";
import {
  ChevronDownRegular,
  ChevronUpRegular,
  FlashRegular,
} from "@fluentui/react-icons";
import { useClashStore } from "../../hooks/useClash";
import { useAppStore } from "../../stores/appStore";
import type { ClashProxyGroup, ClashProxyNode } from "../../types/app";

interface ProxyGroupRowProps {
  group: ClashProxyGroup;
}

function formatDelay(delay: number | null) {
  if (delay === null || Number.isNaN(delay) || delay === 0) {
    return "-- ms";
  }
  if (delay < 0) {
    return "Timeout";
  }
  return `${delay} ms`;
}

function getDelayColor(delay: number | null): "subtle" | "danger" | "success" | "warning" {
  if (delay === null || Number.isNaN(delay) || delay === 0) return "subtle";
  if (delay < 0) return "danger";
  if (delay < 200) return "success";
  if (delay < 500) return "warning";
  return "warning"; // Tailwind used orange/amber
}

export default function ProxyGroupRow({ group }: ProxyGroupRowProps) {
  const isRefreshing = useClashStore((state) => state.isRefreshing);
  const activeMode = useClashStore((state) => state.activeMode);
  const activeSelectionKey = useClashStore((state) => state.activeSelectionKey);
  const activeDelayNode = useClashStore((state) => state.activeDelayNode);
  const activeGroupDelay = useClashStore((state) => state.activeGroupDelay);
  const switchProxy = useClashStore((state) => state.switchProxy);
  const testDelay = useClashStore((state) => state.testDelay);
  const testGroupDelay = useClashStore((state) => state.testGroupDelay);

  const collapsedState = useAppStore((state) => state.appSettings.pages.proxies.collapsed_groups[group.name]);
  const isCollapsed = Boolean(collapsedState);
  const updatePageSettings = useAppStore((state) => state.updatePageSettings);

  const toggleCollapse = useCallback(() => {
    void updatePageSettings("proxies", (settings) => {
      settings.collapsed_groups = {
        ...settings.collapsed_groups,
        [group.name]: !isCollapsed,
      };
    });
  }, [group.name, isCollapsed, updatePageSettings]);

  const actionDisabled = isRefreshing || activeMode !== null || activeGroupDelay !== null;

  return (
    <div className="flex flex-col rounded-xl border border-neutral-700 bg-neutral-800 shadow-sm overflow-hidden">
      <div
        className={`flex items-center justify-between p-3 cursor-pointer select-none transition-colors hover:bg-neutral-700/50 ${!isCollapsed ? "border-b border-neutral-700 bg-neutral-700/30" : ""}`}
        onClick={toggleCollapse}
      >
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Text weight="semibold" className="truncate">{group.name}</Text>
            <Badge appearance="outline" color="subtle" shape="rounded">
              {group.kind}
            </Badge>
          </div>
          <div className="mt-1 flex items-center gap-2 text-neutral-400">
            <Text size={200} className="truncate">{group.current}</Text>
            <Badge color={getDelayColor(group.current_delay)} shape="rounded" appearance="tint">
              {formatDelay(group.current_delay)}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-3">
          <Button
            appearance="subtle"
            icon={activeGroupDelay === group.name ? <Spinner size="extra-tiny" /> : <FlashRegular />}
            disabled={actionDisabled || activeGroupDelay === group.name}
            onClick={(e) => {
              e.stopPropagation();
              void testGroupDelay(group.name);
            }}
            title="Test group delay"
          />
          <Button
            appearance="subtle"
            icon={isCollapsed ? <ChevronDownRegular /> : <ChevronUpRegular />}
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse();
            }}
          />
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-3 bg-neutral-800/50">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {group.options.map((node: ClashProxyNode) => (
              <div
                key={`${group.name}-${node.name}`}
                className={`relative flex flex-col justify-between rounded-lg border p-2.5 transition-all duration-200 cursor-pointer overflow-hidden group ${
                  node.is_selected
                    ? "border-brand-500 bg-brand-500/10 shadow-sm"
                    : "border-neutral-700 bg-neutral-800 hover:border-neutral-600 hover:bg-neutral-700/50"
                }`}
                onClick={() => void switchProxy(group.name, node.name)}
              >
                {node.is_selected && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--colorBrandBackground)]"></div>
                )}

                <div className="flex items-start justify-between gap-2 mb-1.5 pl-1">
                  <Text weight={node.is_selected ? "semibold" : "medium"} truncate title={node.name} className="flex-1">
                    {node.name}
                  </Text>
                  <div className="shrink-0 mt-0.5">
                    <Badge color={getDelayColor(node.delay)} shape="circular" size="small" />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pl-1 mt-auto">
                  <Text size={200} className="uppercase opacity-60 truncate max-w-[60px]">
                    {node.kind}
                  </Text>

                  <Badge
                    color={getDelayColor(node.delay)}
                    appearance="tint"
                    className="z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!actionDisabled) {
                        void testDelay(node.name);
                      }
                    }}
                  >
                    {activeDelayNode === node.name ? "..." : formatDelay(node.delay)}
                  </Badge>
                </div>

                {activeSelectionKey === `${group.name}:${node.name}` && (
                  <div className="absolute inset-0 bg-neutral-900/60 flex items-center justify-center pointer-events-none">
                    <Spinner size="small" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
