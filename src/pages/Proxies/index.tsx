import { useEffect, useCallback } from "react";
import {
  ArrowClockwiseRegular,
  TimerRegular,
} from "@fluentui/react-icons";
import { useClashStore } from "../../stores/clashStore";
import { useClash } from "../../hooks/useClash";
import { Accordion, AccordionItem } from "../../components/ui/Accordion";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Spinner } from "../../components/ui/Spinner";
import type { ClashProxyNode } from "../../types/app";

function delayVariant(delay: number | null): "success" | "warning" | "error" | "default" {
  if (!delay) return "default";
  if (delay < 200) return "success";
  if (delay < 600) return "warning";
  return "error";
}

function DelayBadge({ delay }: { delay: number | null }) {
  if (!delay) return <Badge variant="subtle">--</Badge>;
  return <Badge variant={delayVariant(delay)}>{delay}ms</Badge>;
}

interface ProxyNodeItemProps {
  node: ClashProxyNode;
  selected: boolean;
  groupName: string;
  onSelect: () => void;
  onTest: () => void;
}

function ProxyNodeItem({ node, selected, onSelect, onTest }: ProxyNodeItemProps) {
  return (
    <button
      onClick={onSelect}
      className={[
        "w-full flex items-center justify-between px-3 py-2 text-sm rounded-[var(--wb-radius-md)]",
        "transition-colors duration-100 text-left",
        selected
          ? "bg-[var(--wb-surface-selected)] text-[var(--wb-text-primary)] border border-[var(--wb-accent)]"
          : "hover:bg-[var(--wb-surface-hover)] text-[var(--wb-text-secondary)]",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {selected && (
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--wb-accent)] flex-shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
        {node.type && (
          <Badge variant="subtle">{node.type}</Badge>
        )}
      </div>
      <div
        className="flex items-center gap-2 flex-shrink-0 ml-2"
        onClick={(e) => { e.stopPropagation(); onTest(); }}
      >
        <DelayBadge delay={node.delay} />
      </div>
    </button>
  );
}

export default function Proxies() {
  const groups = useClashStore((s) => s.overview?.proxy_groups ?? []);
  const overview = useClashStore((s) => s.overview);
  const { refreshOverview, switchProxy, testDelay, testGroupDelay } = useClash();

  useEffect(() => {
    void refreshOverview();
  }, [refreshOverview]);

  const handleTestGroup = useCallback(async (groupName: string) => {
    await testGroupDelay(groupName);
  }, [testGroupDelay]);

  if (!overview) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <Spinner />
        <p className="text-sm text-[var(--wb-text-secondary)]">Loading proxies...</p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <p className="text-sm text-[var(--wb-text-secondary)]">No proxy groups found</p>
        <Button icon={<ArrowClockwiseRegular />} onClick={() => void refreshOverview()}>
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--wb-text-primary)]">Proxies</h1>
          <p className="text-sm text-[var(--wb-text-secondary)] mt-0.5">
            {groups.length} groups
          </p>
        </div>
        <Button
          icon={<ArrowClockwiseRegular />}
          variant="subtle"
          onClick={() => void refreshOverview()}
        >
          Refresh
        </Button>
      </div>

      <Accordion
        type="multiple"
        defaultValue={groups.slice(0, 1).map((g) => g.name)}
      >
        {groups.map((group) => (
          <AccordionItem
            key={group.name}
            value={group.name}
            trigger={
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="truncate font-medium">{group.name}</span>
                <Badge variant="subtle">{group.type}</Badge>
                {group.now && (
                  <span className="text-xs text-[var(--wb-accent)] truncate max-w-32">
                    → {group.now}
                  </span>
                )}
                <span className="ml-auto text-xs text-[var(--wb-text-tertiary)]">
                  {group.options.length}
                </span>
              </div>
            }
            actions={
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void handleTestGroup(group.name);
                }}
                className="p-1 text-[var(--wb-text-secondary)] hover:text-[var(--wb-text-primary)] transition-colors rounded"
                title="Test all delays"
              >
                <TimerRegular />
              </button>
            }
          >
            <div className="flex flex-col gap-1 pt-1 pb-2">
              {group.options.map((node) => (
                <ProxyNodeItem
                  key={node.name}
                  node={node}
                  groupName={group.name}
                  selected={group.now === node.name}
                  onSelect={() => void switchProxy(group.name, node.name)}
                  onTest={() => void testDelay(node.name)}
                />
              ))}
            </div>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
