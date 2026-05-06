import { useEffect, useMemo } from "react";
import { ArrowClockwiseRegular, SearchRegular, DismissRegular } from "@fluentui/react-icons";
import { Tabs, TabContent } from "../../components/ui/Tabs";
import { VirtualTable, type ColumnDef } from "../../components/ui/VirtualTable";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { useRulesPage } from "../../hooks/useRules";
import type { RuleEntry } from "../../types/app";
import { formatLastUpdated } from "../../services/utils";

export default function Rules() {
  const {
    visibleRules,
    visibleProviders,
    search,
    setSearch,
    isRefreshing,
    refreshRules,
    updateProvider,
    currentTab,
    setCurrentTab,
  } = useRulesPage();

  useEffect(() => {
    void refreshRules();
  }, [refreshRules]);

  const tableColumns: ColumnDef<RuleEntry>[] = useMemo(
    () => [
      {
        key: "type",
        label: "Type",
        width: 120,
        render: (row) => <Badge variant="subtle">{row.type}</Badge>,
      },
      {
        key: "payload",
        label: "Payload",
        getValue: (row) => row.payload,
      },
      {
        key: "proxy",
        label: "Proxy",
        width: 160,
        render: (row) => (
          <Badge
            variant={
              row.proxy === "REJECT"
                ? "error"
                : row.proxy === "DIRECT"
                ? "success"
                : "accent"
            }
          >
            {row.proxy}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center gap-3 flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-[var(--wb-text-primary)]">Rules</h1>
          <p className="text-sm text-[var(--wb-text-secondary)] mt-0.5">
            {visibleRules.length} rules · {visibleProviders.length} providers
          </p>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-[var(--wb-radius-md)] border border-[var(--wb-border-default)] bg-[var(--wb-surface-layer)] min-w-48">
          <SearchRegular className="text-[var(--wb-text-tertiary)] text-sm" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter rules..."
            className="flex-1 bg-transparent text-sm outline-none text-[var(--wb-text-primary)] placeholder:text-[var(--wb-text-disabled)]"
          />
          {search && (
            <button onClick={() => setSearch("")}>
              <DismissRegular className="text-xs text-[var(--wb-text-tertiary)]" />
            </button>
          )}
        </div>
        <Button
          icon={<ArrowClockwiseRegular />}
          variant="subtle"
          disabled={isRefreshing}
          onClick={() => void refreshRules(true)}
        >
          Refresh
        </Button>
      </div>

      <Tabs
        value={currentTab}
        tabs={[
          { value: "rules", label: `Rules (${visibleRules.length})` },
          { value: "providers", label: `Providers (${visibleProviders.length})` },
        ]}
        onValueChange={(v) => void setCurrentTab(v as "rules" | "providers")}
      >
        <TabContent value="rules">
          <div className="h-full min-h-[400px] rounded-[var(--wb-radius-lg)] border border-[var(--wb-border-subtle)] overflow-hidden">
            <VirtualTable
              columns={tableColumns}
              rows={visibleRules}
              rowHeight={32}
              getRowKey={(row, i) => row.uuid ?? `${i}`}
            />
          </div>
        </TabContent>

        <TabContent value="providers">
          <div className="flex flex-col gap-2">
            {visibleProviders.length === 0 ? (
              <p className="text-sm text-[var(--wb-text-secondary)] p-4">
                No rule providers configured
              </p>
            ) : (
              visibleProviders.map((prov) => (
                <div
                  key={prov.name}
                  className="flex items-center justify-between px-4 py-3 rounded-[var(--wb-radius-md)] border border-[var(--wb-border-subtle)] bg-[var(--wb-surface-layer)]"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--wb-text-primary)]">
                      {prov.name}
                    </p>
                    <p className="text-xs text-[var(--wb-text-secondary)]">
                      {prov.ruleCount ?? 0} rules ·{" "}
                      {prov.vehicleType} ·{" "}
                      {prov.updatedAt ? formatLastUpdated(prov.updatedAt) : "never"}
                    </p>
                  </div>
                  <Button
                    variant="subtle"
                    icon={<ArrowClockwiseRegular />}
                    onClick={() => void updateProvider(prov.name)}
                  >
                    Update
                  </Button>
                </div>
              ))
            )}
          </div>
        </TabContent>
      </Tabs>
    </div>
  );
}
