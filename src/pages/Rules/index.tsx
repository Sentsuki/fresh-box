import {
  ArrowClockwiseRegular,
  DismissRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import { useEffect, useMemo } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/ui/PageHeader";
import { TabContent, Tabs } from "../../components/ui/Tabs";
import { VirtualTable, type ColumnDef } from "../../components/ui/VirtualTable";
import { useRulesPage } from "../../hooks/useRules";
import { formatLastUpdated } from "../../services/utils";
import type { RuleEntry, RulesTab } from "../../types/app";

export default function Rules() {
  const {
    visibleRules,
    search,
    setSearch,
    isRefreshing,
    refreshRules,
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
          description="View active routing rules."
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
                <button
                  onClick={() => setSearch("")}
                  className="hover:bg-(--wb-surface-hover) rounded p-0.5"
                >
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
          ]}
          onValueChange={(v) => setCurrentTab(v as RulesTab)}
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
        </Tabs>
      </div>
    </div>
  );
}
