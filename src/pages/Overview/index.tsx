import { useEffect, useMemo } from "react";
import {
  PlayRegular,
  StopRegular,
  DocumentRegular,
  CloudArrowDownRegular,
  CheckmarkCircleRegular,
  DismissCircleRegular,
  GlobeRegular,
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

  const { startService, stopService } = useSingbox();

  useEffect(() => {
    if (isRunning) void refreshOverview();
  }, [isRunning, refreshOverview]);

  const isSubscription = useMemo(
    () => !!(selectedDisplay && subscriptions[selectedDisplay]),
    [selectedDisplay, subscriptions],
  );

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold text-(--wb-text-primary) tracking-tight">
          Overview
        </h1>
        <p className="text-sm text-(--wb-text-secondary) mt-1">
          Monitor and control your network proxy service.
        </p>
      </header>

      {/* Hero Status Card */}
      <section>
        <Card className="overflow-hidden border-none shadow-lg bg-gradient-to-br from-(--wb-surface-layer) to-(--wb-surface-layer-alt)">
          <div className="flex flex-col md:flex-row items-center gap-8 p-4 md:p-8">
            <div className="relative shrink-0">
              <div className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl shadow-inner transition-all duration-500 ${
                isRunning ? "bg-(--wb-success)/10 text-(--wb-success) scale-110" : "bg-(--wb-text-disabled)/5 text-(--wb-text-disabled)"
              }`}>
                {isRunning ? <CheckmarkCircleRegular /> : <DismissCircleRegular />}
              </div>
              {isRunning && (
                <span className="absolute top-0 right-0 w-6 h-6 bg-(--wb-success) border-4 border-(--wb-surface-layer) rounded-full animate-pulse" />
              )}
            </div>

            <div className="flex-1 text-center md:text-left">
              <h2 className="text-2xl font-bold text-(--wb-text-primary)">
                {isRunning ? "Service is Active" : "Service is Offline"}
              </h2>
              <p className="text-sm text-(--wb-text-secondary) mt-1 mb-6">
                {isRunning
                  ? `Sing-box is currently handling your network traffic using "${selectedDisplay}".`
                  : "Start the service to begin routing your traffic securely."}
              </p>

              <div className="flex flex-wrap justify-center md:justify-start gap-3">
                <Button
                  variant="accent"
                  size="lg"
                  icon={isRunning ? <StopRegular /> : <PlayRegular />}
                  disabled={isPending || (!isRunning && !selectedPath)}
                  onClick={isRunning ? stopService : startService}
                  className="min-w-[140px]"
                >
                  {isPending ? (isRunning ? "Stopping..." : "Starting...") : (isRunning ? "Stop Service" : "Start Service")}
                </Button>
                
                {selectedDisplay && (
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-(--wb-radius-md) bg-(--wb-surface-active) border border-(--wb-border-subtle)">
                    {isSubscription ? (
                      <CloudArrowDownRegular className="text-base text-(--wb-accent)" />
                    ) : (
                      <DocumentRegular className="text-base text-(--wb-text-secondary)" />
                    )}
                    <span className="text-sm font-medium text-(--wb-text-primary) truncate max-w-[150px]">
                      {selectedDisplay}
                    </span>
                    <Badge variant={isSubscription ? "accent" : "subtle"}>
                      {isSubscription ? "Sub" : "Local"}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      </section>

      {isRunning && overview ? (
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <StatusCards overview={overview} />
          <div className="mt-8">
            <TrafficChart />
          </div>
        </section>
      ) : (
        !isRunning && (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-50">
            <div className="text-6xl text-(--wb-text-disabled) mb-4">
              <GlobeRegular />
            </div>
            <p className="text-lg font-medium text-(--wb-text-secondary)">
              No traffic data available
            </p>
            <p className="text-sm text-(--wb-text-tertiary)">
              Start the service to see real-time statistics.
            </p>
          </div>
        )
      )}
    </div>
  );
}

