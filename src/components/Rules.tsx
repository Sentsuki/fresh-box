import { useEffect, useMemo } from "react";
import {
  Text,
  Badge,
  Input,
  Button,
  Card,
  TabList,
  Tab,
  Spinner,
} from "@fluentui/react-components";
import { ArrowClockwiseRegular } from "@fluentui/react-icons";
import { useRulesPage } from "../hooks/useRulesPage";
import { useAppStore } from "../stores/appStore";

export default function Rules() {
  const isRunning = useAppStore((state) => state.isRunning);
  const rulesPage = useRulesPage();

  const statusLabel = useMemo(() => {
    if (!isRunning) return "Service stopped";
    if (rulesPage.isRefreshing) return "Refreshing";
    if (rulesPage.errorMessage) return "Error";
    return "Ready";
  }, [isRunning, rulesPage.isRefreshing, rulesPage.errorMessage]);

  const statusBadgeColor = useMemo(() => {
    if (statusLabel === "Ready") return "success";
    if (statusLabel === "Refreshing") return "warning";
    if (statusLabel === "Error") return "danger";
    return "subtle";
  }, [statusLabel]);

  useEffect(() => {
    if (isRunning) {
      void rulesPage.refreshRules(true);
    }
  }, [isRunning, rulesPage.refreshRules]);

  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden pb-4">
      <div className="flex items-center justify-between">
        <Text size={600} weight="semibold">Rules</Text>
        <Badge color={statusBadgeColor} appearance="filled">
          {statusLabel}
        </Badge>
      </div>

      <div className="flex flex-col gap-4 h-full min-h-0">
        {!isRunning ? (
          <Card className="flex items-center justify-center h-48 border-dashed border-neutral-700 bg-transparent shrink-0">
            <Text className="text-neutral-400">
              Start sing-box first, then open Rules to inspect active routing rules.
            </Text>
          </Card>
        ) : (
          <>
            <Card className="p-3 bg-neutral-800 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <TabList
                    selectedValue={rulesPage.currentTab}
                    onTabSelect={(_, data) => rulesPage.setCurrentTab(data.value as "rules" | "providers")}
                  >
                    <Tab value="rules">Rules ({rulesPage.rules.length})</Tab>
                    {rulesPage.hasProviders && (
                      <Tab value="providers">Providers ({rulesPage.providers.length})</Tab>
                    )}
                  </TabList>

                  <Input
                    value={rulesPage.search}
                    onChange={(_, data) => rulesPage.setSearch(data.value)}
                    placeholder="Search type / payload / proxy / provider"
                    className="min-w-48 flex-1 ml-4"
                  />
                </div>

                <div className="flex items-center gap-1 pr-1">
                  <Button
                    icon={rulesPage.isRefreshing ? <Spinner size="extra-tiny" /> : <ArrowClockwiseRegular />}
                    disabled={!isRunning || rulesPage.isRefreshing}
                    onClick={() => void rulesPage.refreshRules(true)}
                  >
                    {rulesPage.isRefreshing ? "Refreshing" : "Refresh"}
                  </Button>
                </div>
              </div>
            </Card>

            {rulesPage.errorMessage && (
              <Card className="border-red-900/50 bg-red-900/10 shrink-0">
                <Text className="text-red-400">{rulesPage.errorMessage}</Text>
              </Card>
            )}

            {rulesPage.currentTab === "rules" ? (
              <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-800 shadow-sm flex flex-col p-2 gap-2">
                {rulesPage.visibleRules.map((rule, index) => {
                  const isDisabled = rule.extra?.disabled ?? rule.disabled ?? false;
                  const toggleKey = rulesPage.getRuleToggleKey(rule, rule.index ?? index);
                  const isToggling = rulesPage.activeRuleToggle.includes(toggleKey);
                  const canToggle = Boolean(rule.uuid || typeof rule.index === "number");

                  return (
                    <div
                      key={`${rule.type}-${rule.payload}-${index}`}
                      className="flex items-center justify-between rounded-lg border border-neutral-700/50 p-3 transition-colors hover:bg-neutral-700/30 group"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-neutral-700 text-[11px] font-bold text-neutral-400">
                          {(rule.index ?? index) + 1}
                        </div>

                        <div className="min-w-0 flex flex-col">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge appearance="outline" color="brand" shape="rounded">
                              {rule.type}
                            </Badge>
                            <Badge color={isDisabled ? "subtle" : "success"} appearance="tint" shape="rounded">
                              {isDisabled ? "Disabled" : "Enabled"}
                            </Badge>
                            {typeof rule.size === "number" && rule.size >= 0 && (
                              <Badge appearance="outline" color="subtle" shape="rounded">
                                size {rule.size}
                              </Badge>
                            )}

                            {rule.extra && (rule.extra.hitCount || rule.extra.missCount) && (
                              <div className="flex gap-2 text-[11px] text-neutral-400 ml-2">
                                <span className="text-green-500">↑ {rule.extra.hitCount ?? 0}</span>
                                <span className="text-red-500">↓ {rule.extra.missCount ?? 0}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 truncate mt-1">
                            <Text className="text-[13px] font-medium text-neutral-300 truncate" title={rule.payload || "Match All"}>
                              {rule.payload || "Match All"}
                            </Text>
                            <Text className="text-neutral-500">→</Text>
                            <Badge appearance="tint" color="subtle" shape="rounded" className="truncate max-w-[200px]">
                              {rule.proxy || "--"}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {canToggle && (
                        <div className="flex items-center shrink-0 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="small"
                            appearance={isDisabled ? "primary" : "outline"}
                            disabled={isToggling}
                            onClick={() => void rulesPage.toggleRule(rule)}
                            icon={isToggling ? <Spinner size="extra-tiny" /> : undefined}
                          >
                            {isDisabled ? "Enable" : "Disable"}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {rulesPage.visibleRules.length === 0 && (
                  <div className="flex h-48 items-center justify-center text-sm text-neutral-500">
                    No rules matched the current filters.
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-800 shadow-sm flex flex-col p-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {rulesPage.visibleProviders.map((provider) => {
                    const isUpdating = rulesPage.activeProviderUpdates.includes(provider.name);
                    return (
                      <Card key={provider.name} className="relative overflow-hidden group hover:bg-neutral-700/20">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-400"></div>

                        <div className="flex items-start justify-between gap-2 mb-3 ml-2">
                          <Text weight="semibold" className="truncate" title={provider.name}>
                            {provider.name}
                          </Text>
                          <Button
                            appearance="subtle"
                            icon={isUpdating ? <Spinner size="extra-tiny" /> : <ArrowClockwiseRegular />}
                            disabled={isUpdating}
                            onClick={() => void rulesPage.updateProvider(provider.name)}
                            title="Update Provider"
                          />
                        </div>

                        <div className="flex items-center gap-2 mb-4 ml-2">
                          <Badge appearance="outline" color="brand" shape="rounded">
                            {provider.behavior}
                          </Badge>
                          <Badge appearance="outline" color="subtle" shape="rounded">
                            {provider.vehicleType}
                          </Badge>
                        </div>

                        <div className="mt-auto grid grid-cols-2 gap-y-2 gap-x-4 text-[11px] text-neutral-400 bg-neutral-900/50 p-2.5 rounded-lg border border-neutral-700/50 ml-2">
                          <div className="flex items-center justify-between">
                            <span>Rules</span>
                            <Text weight="medium">{provider.ruleCount}</Text>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Type</span>
                            <Text weight="medium">{provider.type}</Text>
                          </div>
                          <div className="flex items-center justify-between col-span-2 border-t border-neutral-700/50 pt-2">
                            <span>Updated</span>
                            <Text weight="medium">{provider.updatedAt || "Never"}</Text>
                          </div>
                        </div>
                      </Card>
                    );
                  })}

                  {rulesPage.visibleProviders.length === 0 && (
                    <div className="col-span-full flex h-48 items-center justify-center text-sm text-neutral-500">
                      No rule providers are available.
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

