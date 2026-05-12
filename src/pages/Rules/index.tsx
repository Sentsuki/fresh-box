import {
  ArrowClockwiseRegular,
  DismissRegular,
  DocumentRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
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

  const [isReady, setIsReady] = useState(false);
  const [selectedRule, setSelectedRule] = useState<RuleEntry | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 10);
    return () => clearTimeout(timer);
  }, []);

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
              {!isReady ? null : (
                <div
                  ref={containerRef}
                  className="h-full overflow-auto custom-scrollbar animate-pop-in"
                >
                  <div
                    style={{
                      width: "100%",
                      minWidth: Math.max(table.getTotalSize(), 900),
                    }}
                  >
                    <div className="sticky top-0 z-10 bg-(--wb-surface-layer) border-b border-(--wb-border-subtle)">
                      {table.getHeaderGroups().map((headerGroup) => (
                        <div key={headerGroup.id} className="flex">
                          {headerGroup.headers.map((header, index) => {
                            const isLast =
                              index === headerGroup.headers.length - 1;
                            return (
                              <div
                                key={header.id}
                                className="h-10 px-4 flex items-center text-xs font-medium text-(--wb-text-secondary) border-r border-(--wb-border-subtle)"
                                style={{
                                  width: isLast ? undefined : header.getSize(),
                                  minWidth: isLast
                                    ? header.getSize()
                                    : undefined,
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
                              "hover:bg-(--wb-surface-hover) cursor-pointer",
                            ].join(" ")}
                            style={{
                              transform: `translateY(${virtualRow.start}px)`,
                            }}
                            onClick={() => setSelectedRule(row.original)}
                          >
                            {row.getVisibleCells().map((cell, index) => {
                              const isLast =
                                index === row.getVisibleCells().length - 1;
                              return (
                                <div
                                  key={cell.id}
                                  className="px-4 flex items-center text-[13px] border-r border-(--wb-border-subtle) truncate"
                                  style={{
                                    width: isLast
                                      ? undefined
                                      : cell.column.getSize(),
                                    minWidth: isLast
                                      ? cell.column.getSize()
                                      : undefined,
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
              )}
            </div>
          </TabContent>
        </Tabs>
      </div>

      <RuleDetailsModal
        rule={selectedRule}
        open={selectedRule !== null}
        onClose={() => setSelectedRule(null)}
      />
    </div>
  );
}

interface RuleDetailsModalProps {
  rule: RuleEntry | null;
  open: boolean;
  onClose: () => void;
}

function RuleDetailsModal({ rule, open, onClose }: RuleDetailsModalProps) {
  if (!open || !rule) return null;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4 sm:p-6 bg-black/50 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex flex-col w-full max-w-2xl max-h-[90vh] rounded-(--wb-radius-lg) bg-(--wb-surface-flyout) border border-(--wb-border-default) shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-black/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-(--wb-accent)/10 flex items-center justify-center text-(--wb-accent)">
              <DocumentRegular className="text-xl" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-(--wb-text-primary) leading-tight">
                Rule Details
              </h3>
              <p className="text-sm text-(--wb-text-secondary) truncate max-w-[300px] sm:max-w-md">
                {rule.payload}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-(--wb-surface-hover) text-(--wb-text-tertiary) hover:text-(--wb-text-primary) transition-colors"
          >
            <DismissRegular className="text-xl" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <div className="grid gap-px bg-(--wb-border-subtle) rounded-lg border border-(--wb-border-subtle) overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-2.5 bg-(--wb-surface-layer) group hover:bg-(--wb-surface-hover) transition-colors">
              <dt className="text-xs font-medium text-(--wb-text-secondary)">
                Type
              </dt>
              <dd className="text-xs font-semibold text-(--wb-text-primary) text-right truncate ml-4">
                <Badge variant="subtle">{rule.type}</Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 bg-(--wb-surface-layer) group hover:bg-(--wb-surface-hover) transition-colors">
              <dt className="text-xs font-medium text-(--wb-text-secondary)">
                Payload
              </dt>
              <dd className="text-xs font-semibold text-(--wb-text-primary) text-right break-all ml-4">
                {rule.payload}
              </dd>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 bg-(--wb-surface-layer) group hover:bg-(--wb-surface-hover) transition-colors">
              <dt className="text-xs font-medium text-(--wb-text-secondary)">
                Proxy
              </dt>
              <dd className="text-xs font-semibold text-(--wb-text-primary) text-right truncate ml-4">
                <Badge
                  variant={
                    rule.proxy === "REJECT"
                      ? "error"
                      : rule.proxy === "DIRECT"
                        ? "success"
                        : "accent"
                  }
                >
                  {rule.proxy}
                </Badge>
              </dd>
            </div>
          </div>

          <div className="mt-6 flex flex-col">
            <h4 className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider text-(--wb-text-tertiary)">
              Raw Data (JSON)
            </h4>
            <div className="rounded-lg border border-(--wb-border-default) bg-[#1e1e1e] p-4 font-mono text-[11px] leading-relaxed overflow-hidden flex flex-col shadow-inner">
              <pre className="text-sky-300/90 whitespace-pre-wrap break-all">
                {JSON.stringify(rule, null, 2)}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-black/10 flex items-center justify-end border-t border-(--wb-border-default)">
          <Button variant="subtle" onClick={onClose} className="min-w-24">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
