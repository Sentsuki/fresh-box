import { useEffect, useMemo } from "react";
import {
  PlayRegular,
  StopRegular,
  DocumentRegular,
  CloudArrowDownRegular,
  OpenRegular,
  CheckmarkCircleRegular,
  DismissCircleRegular,
} from "@fluentui/react-icons";
import { useSingboxStore } from "../../stores/singboxStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useConfigStore } from "../../stores/configStore";
import { useClashStore } from "../../stores/clashStore";
import { useSingbox } from "../../hooks/useSingbox";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import StatusCards from "./StatusCards";
import TrafficChart from "./TrafficChart";

export default function Overview() {
  const isRunning = useSingboxStore((s) => s.isRunning);
  const isPending = useSingboxStore((s) => s.pendingOperation);
  const selectedDisplay = useSettingsStore(
    (s) => s.settings.app.selected_config_display,
  );
  const selectedPath = useSettingsStore(
    (s) => s.settings.app.selected_config_path,
  );
  const subscriptions = useConfigStore((s) => s.subscriptions);
  const overview = useClashStore((s) => s.overview);
  const refreshOverview = useClashStore((s) => s.refreshOverview);

  const { startService, stopService, openPanel } = useSingbox();

  useEffect(() => {
    if (isRunning) void refreshOverview();
  }, [isRunning, refreshOverview]);

  const isSubscription = useMemo(
    () => !!(selectedDisplay && subscriptions[selectedDisplay]),
    [selectedDisplay, subscriptions],
  );

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-[var(--wb-text-primary)]">
          Overview
        </h1>
        <p className="text-sm text-[var(--wb-text-secondary)] mt-0.5">
          Service control and status
        </p>
      </div>

      {/* Status card */}
      <Card>
        <div className="flex items-start gap-4">
          <div
            className={[
              "text-3xl flex-shrink-0 mt-0.5",
              isRunning
                ? "text-[#6BB44A]"
                : "text-[var(--wb-text-disabled)]",
            ].join(" ")}
          >
            {isRunning ? (
              <CheckmarkCircleRegular />
            ) : (
              <DismissCircleRegular />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--wb-text-primary)]">
                  {isRunning ? "Service Running" : "Service Stopped"}
                </p>
                <p className="text-xs text-[var(--wb-text-secondary)] mt-0.5">
                  {isRunning
                    ? "Sing-box is active and ready"
                    : "Select a config and click Start"}
                </p>
              </div>
              {isRunning && (
                <button
                  onClick={openPanel}
                  className="flex items-center gap-1 text-xs text-[var(--wb-accent)] hover:text-[var(--wb-accent-hover)] transition-colors"
                >
                  <OpenRegular />
                  Panel
                </button>
              )}
            </div>

            {selectedDisplay && (
              <div className="mt-3 flex items-center justify-between px-3 py-2 rounded-[var(--wb-radius-md)] bg-[rgba(0,0,0,0.2)] border border-[var(--wb-border-subtle)]">
                <div className="flex items-center gap-2 min-w-0">
                  {isSubscription ? (
                    <CloudArrowDownRegular className="flex-shrink-0 text-sm text-[var(--wb-text-secondary)]" />
                  ) : (
                    <DocumentRegular className="flex-shrink-0 text-sm text-[var(--wb-text-secondary)]" />
                  )}
                  <span className="text-xs text-[var(--wb-text-primary)] truncate">
                    {selectedDisplay}
                  </span>
                </div>
                <Badge variant={isSubscription ? "accent" : "subtle"}>
                  {isSubscription ? "Subscription" : "Local"}
                </Badge>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <Button
                variant="accent"
                icon={<PlayRegular />}
                disabled={isRunning || isPending || !selectedPath}
                onClick={startService}
              >
                {isPending && !isRunning ? "Starting..." : "Start"}
              </Button>
              <Button
                icon={<StopRegular />}
                disabled={!isRunning || isPending}
                onClick={stopService}
              >
                {isPending && isRunning ? "Stopping..." : "Stop"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {isRunning && overview && (
        <>
          <StatusCards overview={overview} />
          <TrafficChart />
        </>
      )}
    </div>
  );
}
