import {
  ArrowClockwiseRegular,
  DismissRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/ui/PageHeader";
import { TabContent, Tabs } from "../../components/ui/Tabs";
import { useRulesPage } from "../../hooks/useRules";
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

  const tableColumns = useMemo<ColumnDef<RuleEntry>[]>(
    () => [
      {
        id: "type",
        accessorFn: (row) => row.type,
        size: 140,
        header: "Type",
        cell: (ctx) => <Badge variant="subtle">{String(ctx.getValue())}</Badge>,
      },
      {
        id: "payload",
        accessorFn: (row) => row.payload,
        size: 560,
        header: "Payload",
        cell: (ctx) => (
          <span className="truncate text-(--wb-text-primary)">
            {String(ctx.getValue())}
          </span>
        ),
      },
      {
        id: "proxy",
        accessorFn: (row) => row.proxy,
        size: 200,
        header: "Proxy",
        cell: (ctx) => {
          const proxy = String(ctx.getValue());
          return (
            <Badge
              variant={
                proxy === "REJECT"
                  ? "error"
                  : proxy === "DIRECT"
                    ? "success"
                    : "accent"
              }
            >
              {proxy}
            </Badge>
          );
        },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: visibleRules,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 40,
    overscan: 8,
  });

  useEffect(() => {
    void refreshRules();
  }, [refreshRules]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 pr-2">
        <PageHeader title="Rules" description="View active routing rules.">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-layer) min-w-64">
              <SearchRegular className="text-(--wb-text-tertiary) text-sm" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
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
          tabs={[{ value: "rules", label: `Rules (${visibleRules.length})` }]}
          onValueChange={(value) => setCurrentTab(value as RulesTab)}
          className="flex-1"
        >
          <TabContent value="rules" className="h-full mt-4">
            <div className="h-full rounded-xl border border-(--wb-border-subtle) bg-(--wb-surface-layer) overflow-hidden">
              <div
                ref={containerRef}
                className="h-full overflow-auto custom-scrollbar"
              >
                <div style={{ width: "100%", minWidth: Math.max(table.getTotalSize(), 900) }}>
                  <div className="sticky top-0 z-10 bg-(--wb-surface-layer) border-b border-(--wb-border-subtle)">
                    {table.getHeaderGroups().map((headerGroup) => (
                      <div key={headerGroup.id} className="flex">
                        {headerGroup.headers.map((header, index) => {
                          const isLast = index === headerGroup.headers.length - 1;
                          return (
                            <div
                              key={header.id}
                              className="h-10 px-4 flex items-center text-xs font-medium text-(--wb-text-secondary) border-r border-(--wb-border-subtle)"
                              style={{
                                width: isLast ? undefined : header.getSize(),
                                minWidth: isLast ? header.getSize() : undefined,
                                flexGrow: isLast ? 1 : undefined,
                              }}
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      height: rowVirtualizer.getTotalSize(),
                      position: "relative",
                    }}
                  >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const row = rows[virtualRow.index];
                      return (
                        <div
                          key={row.id}
                          className={[
                            "absolute left-0 w-full h-10 flex border-b border-(--wb-border-subtle)",
                            virtualRow.index % 2 === 1
                              ? "bg-(--wb-surface-active)"
                              : "",
                            "hover:bg-(--wb-surface-hover)",
                          ].join(" ")}
                          style={{ transform: `translateY(${virtualRow.start}px)` }}
                        >
                          {row.getVisibleCells().map((cell, index) => {
                            const isLast = index === row.getVisibleCells().length - 1;
                            return (
                              <div
                                key={cell.id}
                                className="px-4 flex items-center text-[13px] border-r border-(--wb-border-subtle) truncate"
                                style={{
                                  width: isLast ? undefined : cell.column.getSize(),
                                  minWidth: isLast ? cell.column.getSize() : undefined,
                                  flexGrow: isLast ? 1 : undefined,
                                }}
                              >
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext(),
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </TabContent>
        </Tabs>
      </div>
    </div>
  );
}
