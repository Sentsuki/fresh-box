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
import { Badge } from "../../components/ui/Badge";

export default function Overview() {
  const isRunning = useSingboxStore((s) => s.isRunning);
  const isPending = useSingboxStore((s) => s.pendingOperation);
  const selectedDisplay = useSettingsStore(
    (s) => s.settings.Profiles.selected_config_display,
  );
  const selectedPath = useSettingsStore(
    (s) => s.settings.Profiles.selected_config_path,
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
        {/* Dashboard Hero Card - Clean & Minimal */}
        <div className="rounded-2xl border border-(--wb-border-subtle) bg-(--wb-surface-layer) shadow-sm">
          <div className="p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="flex items-start sm:items-center gap-5 sm:gap-6">
              {/* Status Icon */}
              <div
                className={`shrink-0 w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center rounded-2xl transition-colors duration-300 ${
                  isRunning
                    ? "bg-(--wb-badge-success-bg) text-(--wb-success) border-2 border-(--wb-success-border)"
                    : "bg-(--wb-badge-default-bg) text-(--wb-text-tertiary) border-2 border-(--wb-border-default)"
                }`}
              >
                {isRunning ? (
                  <ShieldCheckmarkRegular className="text-3xl sm:text-4xl" />
                ) : (
                  <ShieldErrorRegular className="text-3xl sm:text-4xl" />
                )}
              </div>

              {/* Status Text & Profile */}
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-xl sm:text-2xl font-semibold text-(--wb-text-primary) tracking-tight">
                    {isRunning ? "System Protected" : "Protection Disabled"}
                  </h2>
                  <Badge variant={isRunning ? "success" : "default"}>
                    {isRunning ? "Active" : "Inactive"}
                  </Badge>
                </div>

                <p className="text-sm text-(--wb-text-secondary) mb-3 max-w-md leading-relaxed">
                  {isRunning
                    ? "Network traffic is securely encrypted and routed."
                    : "Traffic is currently bypassing the proxy. Connect to secure."}
                </p>

                {selectedDisplay ? (
                  <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-(--wb-surface-hover) border border-(--wb-border-subtle) text-xs text-(--wb-text-primary)">
                    {isSubscription ? (
                      <CloudArrowDownRegular className="text-(--wb-accent)" />
                    ) : (
                      <DocumentRegular className="text-(--wb-accent)" />
                    )}
                    <span className="font-medium">{selectedDisplay}</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-(--wb-error)/10 text-xs text-(--wb-error)">
                    <ShieldErrorRegular />
                    <span className="font-medium">No profile selected</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Button */}
            <div className="w-full sm:w-auto shrink-0 mt-2 sm:mt-0">
              <button
                disabled={isPending || !selectedPath}
                onClick={isRunning ? stopService : startService}
                className={`
                  flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-3 rounded-xl text-sm font-semibold transition-all duration-200
                  ${isPending || !selectedPath ? "opacity-50 cursor-not-allowed" : "hover:scale-[1.02] active:scale-[0.98]"}
                  ${
                    isRunning
                      ? "bg-(--wb-error) text-white hover:bg-[#ff6666]"
                      : "bg-(--wb-accent) text-white hover:bg-(--wb-accent-hover)"
                  }
                `}
              >
                {isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />{" "}
                    Processing
                  </>
                ) : isRunning ? (
                  <>
                    <StopRegular className="text-lg" /> Disconnect
                  </>
                ) : (
                  <>
                    <PlayRegular className="text-lg" /> Connect
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Status / Traffic Sections */}
        <div
          className={`transition-all duration-700 ease-in-out origin-top ${isRunning ? "opacity-100 scale-y-100" : "opacity-100"}`}
        >
          {isRunning ? (
            overview ? (
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
                    <div
                      key={i}
                      className="flex-1 min-w-[200px] h-24 bg-(--wb-surface-layer) rounded-(--wb-radius-md) border border-(--wb-border-subtle) animate-pulse"
                    />
                  ))}
                </div>
                <div className="h-64 bg-(--wb-surface-layer) rounded-(--wb-radius-md) border border-(--wb-border-subtle) animate-pulse" />
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-sm text-(--wb-text-secondary) bg-(--wb-surface-layer) border border-(--wb-border-subtle) rounded-xl shadow-sm">
              <span className="font-semibold text-lg mb-2 text-(--wb-text-primary)">
                Core is not running
              </span>
              <span>
                Please start the core service to view dashboard metrics.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
