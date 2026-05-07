import { ArrowClockwiseRegular, DismissRegular, SearchRegular } from "@fluentui/react-icons";
import { useEffect, useMemo } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/ui/PageHeader";
import { TabContent, Tabs } from "../../components/ui/Tabs";
import { VirtualTable, type ColumnDef } from "../../components/ui/VirtualTable";
import { useRulesPage } from "../../hooks/useRules";
import { formatLastUpdated } from "../../services/utils";
import type { RuleEntry } from "../../types/app";

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
        width: 140,
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
        width: 180,
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
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 pr-2">
        <PageHeader
          title="Rules"
          description="View active routing rules and manage external rule providers."
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-layer) min-w-64">
              <SearchRegular className="text-(--wb-text-tertiary) text-sm" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter rules..."
                className="flex-1 bg-transparent text-sm outline-none text-(--wb-text-primary) placeholder:text-(--wb-text-disabled)"
              />
              {search && (
                <button onClick={() => setSearch("")} className="hover:bg-(--wb-surface-hover) rounded p-0.5">
                  <DismissRegular className="text-xs text-(--wb-text-tertiary)" />
                </button>
              )}
            </div>
            <Button
              icon={<ArrowClockwiseRegular />}
              variant="accent"
              disabled={isRefreshing}
              onClick={() => void refreshRules(true)}
            >
              Refresh
            </Button>
          </div>
        </PageHeader>
      </div>

      <div className="flex flex-col flex-1 min-h-0 pr-2 pb-10">
        <Tabs
          value={currentTab}
          tabs={[
            { value: "rules", label: `Rules (${visibleRules.length})` },
            { value: "providers", label: `Providers (${visibleProviders.length})` },
          ]}
          onValueChange={(v) => setCurrentTab(v as any)}
          className="flex-1"
        >
          <TabContent value="rules" className="h-full mt-4">
            <div className="h-full rounded-xl border border-(--wb-border-subtle) bg-(--wb-surface-layer) overflow-hidden">
              <VirtualTable
                rows={visibleRules}
                columns={tableColumns}
                rowHeight={40}
                getRowKey={(row) => row.payload + row.type + row.proxy}
              />
            </div>
          </TabContent>
          <TabContent value="providers" className="h-full overflow-y-auto mt-4">
            <div className="flex flex-col gap-4 pb-4">
              {visibleProviders.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-sm text-(--wb-text-secondary) bg-(--wb-surface-layer) border border-(--wb-border-subtle) rounded-xl">
                  No rule providers configured.
                </div>
              ) : (
                visibleProviders.map((p) => (
                  <div
                    key={p.name}
                    className="flex flex-col p-5 rounded-xl border border-(--wb-border-subtle) bg-(--wb-surface-layer)"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <p className="text-base font-semibold text-(--wb-text-primary)">
                            {p.name}
                          </p>
                          <Badge variant="subtle" className="uppercase tracking-wider text-[10px]">
                            {p.vehicleType}
                          </Badge>
                        </div>
                        <p className="text-xs text-(--wb-text-tertiary) mt-1.5 font-mono">
                          {p.behavior} · {p.ruleCount} rules
                        </p>
                        {p.updatedAt && (
                          <p className="text-xs text-(--wb-text-secondary) mt-2">
                            Updated {formatLastUpdated(p.updatedAt)}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="subtle"
                        icon={<ArrowClockwiseRegular />}
                        onClick={() => void updateProvider(p.name)}
                      >
                        Update
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabContent>
        </Tabs>
      </div>
    </div>
  );
}
