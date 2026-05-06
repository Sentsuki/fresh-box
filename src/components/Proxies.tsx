import { useEffect } from "react";
import {
  Text,
  Button,
  Select,
  Spinner,
  Card,
} from "@fluentui/react-components";
import { ArrowClockwiseRegular } from "@fluentui/react-icons";
import ProxyGroupRow from "./proxy/ProxyGroupRow";
import { useClash } from "../hooks/useClash";
import { useAppStore } from "../stores/appStore";

export default function Proxies() {
  const appStore = useAppStore();
  const clash = useClash();

  const isRunning = appStore.isRunning;
  const modeOptions = clash.overview?.available_modes ?? [];
  const proxyGroups = clash.overview?.proxy_groups ?? [];

  useEffect(() => {
    if (isRunning && !clash.hasData && !clash.isRefreshing) {
      void clash.refreshOverview(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto pr-2 pb-4">
      <div className="flex items-center justify-between">
        <Text size={600} weight="semibold">Proxies</Text>
      </div>

      <div className="flex flex-col gap-4">
        {!isRunning ? (
          <Card className="flex items-center justify-center h-48 border-dashed border-neutral-700 bg-transparent">
            <Text className="text-neutral-400">
              Start sing-box first, then open Proxies to manage groups and run tests.
            </Text>
          </Card>
        ) : clash.errorMessage ? (
          <Card className="border-red-900/50 bg-red-900/10">
            <div className="flex flex-col gap-3">
              <Text className="text-red-400">{clash.errorMessage}</Text>
              <div>
                <Button appearance="primary" onClick={() => void clash.refreshOverview(true)}>
                  Retry
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <>
            <Card className="p-3 bg-neutral-800">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Text weight="medium">Mode:</Text>
                  <Select
                    disabled={
                      !isRunning ||
                      clash.isRefreshing ||
                      clash.activeMode !== null ||
                      clash.activeGroupDelay !== null ||
                      modeOptions.length === 0
                    }
                    value={clash.overview?.current_mode ?? ""}
                    onChange={(_, data) => {
                      void clash.changeMode(data.value);
                    }}
                  >
                    {modeOptions.length === 0 && <option value="">No modes</option>}
                    {modeOptions.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </Select>
                </div>

                <Button
                  icon={clash.isRefreshing ? <Spinner size="extra-tiny" /> : <ArrowClockwiseRegular />}
                  disabled={
                    clash.isRefreshing ||
                    clash.activeMode !== null ||
                    clash.activeGroupDelay !== null
                  }
                  onClick={() => void clash.refreshOverview(true)}
                >
                  {clash.isRefreshing ? "Refreshing" : "Refresh"}
                </Button>
              </div>
            </Card>

            {proxyGroups.length === 0 ? (
              <Card className="flex items-center justify-center h-32 border-dashed border-neutral-700 bg-transparent">
                <Text className="text-neutral-400">No proxy groups were returned by the core.</Text>
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                {proxyGroups.map((group) => (
                  <ProxyGroupRow key={group.name} group={group} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
