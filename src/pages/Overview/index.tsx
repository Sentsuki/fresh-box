import { useEffect, useMemo } from "react";
import {
  PlayRegular,
  StopRegular,
  DocumentRegular,
  CloudArrowDownRegular,
  ShieldCheckmarkRegular,
  ShieldErrorRegular,
} from "@fluentui/react-icons";
import { useSingboxStore } from "../../stores/singboxStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useConfigStore } from "../../stores/configStore";
import { useClashStore } from "../../stores/clashStore";
import { useSingbox } from "../../hooks/useSingbox";
import StatusCards from "./StatusCards";
import TrafficChart from "./TrafficChart";
import { PageHeader } from "../../components/ui/PageHeader";

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
    <div className="flex flex-col h-full overflow-y-auto pr-2 pb-10">
      <PageHeader 
        title="Overview" 
        description="Monitor traffic and control the sing-box core service."
      />

      <div className="flex flex-col gap-8">
        
        {/* Dashboard Hero Card */}
        <div className="relative overflow-hidden rounded-2xl bg-(--wb-surface-layer) border border-(--wb-border-subtle) shadow-sm p-8 flex flex-col items-center justify-center text-center">
          {/* Subtle Background Glow based on status */}
          <div 
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 blur-3xl rounded-full opacity-20 pointer-events-none transition-colors duration-1000 ${isRunning ? 'bg-(--wb-success)' : 'bg-(--wb-text-disabled)'}`} 
          />

          <div className="relative z-10 flex flex-col items-center gap-4">
            <div className={`w-20 h-20 flex items-center justify-center rounded-full transition-all duration-500 ${isRunning ? 'bg-(--wb-success-bg) text-(--wb-success) shadow-[0_0_20px_rgba(107,180,74,0.3)]' : 'bg-(--wb-surface-hover) text-(--wb-text-tertiary)'}`}>
              {isRunning ? <ShieldCheckmarkRegular className="text-4xl" /> : <ShieldErrorRegular className="text-4xl" />}
            </div>

            <div>
              <h2 className="text-2xl font-bold text-(--wb-text-primary)">
                {isRunning ? "System Protected" : "Protection Disabled"}
              </h2>
              <p className="text-sm text-(--wb-text-secondary) mt-1">
                {isRunning ? "All traffic is being routed securely." : "Network traffic is currently bypassing the proxy."}
              </p>
            </div>

            {selectedDisplay && (
              <div className="flex items-center gap-2 mt-2 px-4 py-2 rounded-full bg-(--wb-surface-base) border border-(--wb-border-default)">
                {isSubscription ? (
                  <CloudArrowDownRegular className="text-(--wb-accent) text-lg" />
                ) : (
                  <DocumentRegular className="text-(--wb-accent) text-lg" />
                )}
                <span className="text-sm font-medium text-(--wb-text-primary)">
                  {selectedDisplay}
                </span>
              </div>
            )}

            <div className="mt-4">
              <button
                disabled={isPending || !selectedPath}
                onClick={isRunning ? stopService : startService}
                className={[
                  "flex items-center justify-center gap-2 px-12 py-3 rounded-full text-base font-bold transition-all duration-200 shadow-md",
                  isRunning 
                    ? "bg-(--wb-surface-base) border-2 border-(--wb-border-default) text-(--wb-text-primary) hover:bg-(--wb-surface-hover)"
                    : "bg-(--wb-accent) border-2 border-(--wb-accent) text-white hover:bg-(--wb-accent-hover) hover:border-(--wb-accent-hover)",
                  (isPending || !selectedPath) ? "opacity-50 cursor-not-allowed transform-none" : "hover:scale-105 active:scale-95"
                ].join(" ")}
              >
                {isPending ? (
                  <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"/> Processing...</span>
                ) : isRunning ? (
                  <><StopRegular className="text-xl" /> Stop Service</>
                ) : (
                  <><PlayRegular className="text-xl" /> Start Service</>
                )}
              </button>
              {!selectedPath && !isRunning && (
                <p className="text-xs text-(--wb-error) mt-3">
                  Please select a config profile first.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Dynamic Status / Traffic Sections */}
        <div className={`transition-all duration-700 ease-in-out origin-top ${isRunning ? 'opacity-100 scale-y-100' : 'opacity-50 grayscale pointer-events-none'}`}>
          {overview ? (
            <div className="flex flex-col gap-6">
              <StatusCards overview={overview} />
              <div className="bg-(--wb-surface-layer) rounded-(--wb-radius-md) border border-(--wb-border-subtle) p-4 shadow-sm">
                <TrafficChart />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex-1 min-w-[200px] h-24 bg-(--wb-surface-layer) rounded-(--wb-radius-md) border border-(--wb-border-subtle) animate-pulse" />
                ))}
              </div>
              <div className="h-64 bg-(--wb-surface-layer) rounded-(--wb-radius-md) border border-(--wb-border-subtle) animate-pulse" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
