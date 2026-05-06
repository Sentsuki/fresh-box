import React, { useEffect, useState, useMemo } from "react";
import {
  Text,
  Badge,
  Input,
  Button,
  Card,
  TabList,
  Tab,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  Checkbox,
  Divider,
} from "@fluentui/react-components";
import {
  PlayRegular,
  PauseRegular,
  DismissRegular,
  ChevronDownRegular,
  ChevronUpRegular,
  FilterDismissRegular,
  DismissCircleRegular,
} from "@fluentui/react-icons";
import { useConnectionsStream } from "../hooks/useConnectionsStream";
import { useAppStore } from "../stores/appStore";
import ConnectionDetailsModal from "./connections/ConnectionDetailsModal";
import ConnectionTableCell from "./connections/ConnectionTableCell";

export default function Connections() {
  const appStore = useAppStore();
  const connections = useConnectionsStream();
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);

  const isRunning = appStore.isRunning;

  const statusLabel = useMemo(() => {
    if (!isRunning) return "Service stopped";
    if (connections.streamStatus === "connected") return "Live";
    if (connections.streamStatus === "connecting") return "Connecting";
    if (connections.streamStatus === "error") return "Error";
    return "Disconnected";
  }, [isRunning, connections.streamStatus]);

  const statusBadgeColor = useMemo(() => {
    if (statusLabel === "Live") return "success";
    if (statusLabel === "Connecting") return "warning";
    if (statusLabel === "Error") return "danger";
    return "subtle";
  }, [statusLabel]);

  const canCloseVisible = useMemo(() => {
    return connections.currentTab === "active" && connections.visibleConnections.length > 0;
  }, [connections.currentTab, connections.visibleConnections.length]);

  useEffect(() => {
    if (isRunning) {
      connections.startStream();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isRunning) {
      connections.startStream();
    } else {
      connections.stopStream(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

  useEffect(() => {
    return () => {
      connections.stopStream(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden pb-4">
      <div className="flex items-center justify-between">
        <Text size={600} weight="semibold">Connections</Text>
        <Badge color={statusBadgeColor} appearance="filled">
          {statusLabel}
        </Badge>
      </div>

      <div className="flex flex-col gap-4 h-full min-h-0">
        {!isRunning ? (
          <Card className="flex items-center justify-center h-48 border-dashed border-neutral-700 bg-transparent shrink-0">
            <Text className="text-neutral-400">
              Start sing-box first, then open Connections to inspect live traffic.
            </Text>
          </Card>
        ) : (
          <>
            <Card className="p-3 bg-neutral-800 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <TabList
                    selectedValue={connections.currentTab}
                    onTabSelect={(_, data) => connections.setCurrentTab(data.value as "active" | "closed")}
                  >
                    <Tab value="active">Active ({connections.activeCount})</Tab>
                    <Tab value="closed">Closed ({connections.closedCount})</Tab>
                  </TabList>

                  <Input
                    value={connections.search}
                    onChange={(_, data) => connections.setSearch(data.value)}
                    placeholder="Search host / IP / rule / chain / process"
                    className="min-w-56 flex-1 ml-4"
                  />

                  <Menu open={columnsMenuOpen} onOpenChange={(_, data) => setColumnsMenuOpen(data.open)}>
                    <MenuTrigger disableButtonEnhancement>
                      <Button appearance="subtle">Columns</Button>
                    </MenuTrigger>
                    <MenuPopover>
                      <MenuList className="p-2 w-80">
                        <div className="flex items-center justify-between mb-2">
                          <Text weight="semibold">Custom columns</Text>
                          <Button appearance="transparent" size="small" onClick={connections.resetColumnCustomization}>
                            Reset
                          </Button>
                        </div>
                        <Divider className="mb-2" />
                        <div className="max-h-60 overflow-y-auto space-y-1">
                          {connections.orderedColumnOptions.map((column, index) => (
                            <div key={column.key} className="flex items-center gap-2">
                              <Checkbox
                                checked={connections.isColumnVisible(column.key)}
                                onChange={() => connections.toggleColumnVisibility(column.key)}
                                label={column.label}
                                className="flex-1"
                              />
                              <Button
                                appearance="subtle"
                                icon={<ChevronUpRegular />}
                                size="small"
                                disabled={index === 0}
                                onClick={() => connections.moveColumn(column.key, -1)}
                              />
                              <Button
                                appearance="subtle"
                                icon={<ChevronDownRegular />}
                                size="small"
                                disabled={index === connections.orderedColumnOptions.length - 1}
                                onClick={() => connections.moveColumn(column.key, 1)}
                              />
                            </div>
                          ))}
                        </div>
                      </MenuList>
                    </MenuPopover>
                  </Menu>

                  {connections.groupedColumn && (
                    <Badge appearance="tint" color="brand" shape="rounded">
                      Grouped by {connections.groupedColumn.label}
                      <Button
                        appearance="transparent"
                        icon={<FilterDismissRegular />}
                        size="small"
                        className="ml-2"
                        onClick={connections.clearGrouping}
                      />
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-1 pr-1">
                  <Button
                    appearance="subtle"
                    icon={connections.isPaused ? <PlayRegular /> : <PauseRegular />}
                    onClick={() => connections.setIsPaused(!connections.isPaused)}
                    title={connections.isPaused ? "Resume" : "Pause"}
                  />

                  {connections.currentTab === "active" && (
                    <Button
                      appearance="subtle"
                      icon={<DismissCircleRegular className="text-red-500" />}
                      disabled={!canCloseVisible || connections.isDisconnectingAll}
                      onClick={connections.disconnectVisibleConnections}
                      title="Close Visible Connections"
                    />
                  )}

                  {connections.currentTab === "closed" && (
                    <Button
                      appearance="subtle"
                      icon={<DismissRegular className="text-red-500" />}
                      onClick={connections.clearClosedConnections}
                      title="Clear Closed Connections"
                    />
                  )}
                </div>
              </div>
            </Card>

            {connections.streamError && (
              <Card className="border-red-900/50 bg-red-900/10 shrink-0">
                <Text className="text-red-400">{connections.streamError}</Text>
              </Card>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-800 shadow-sm">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-10 bg-neutral-800/95 backdrop-blur-sm shadow-sm">
                  <tr>
                    {connections.visibleColumns.map((column) => (
                      <th
                        key={column.key}
                        className={`border-b border-neutral-700 px-4 py-3 align-middle ${
                          column.align === "end" ? "text-right" : "text-left"
                        }`}
                      >
                        <div className={`flex items-center gap-1 ${column.align === "end" ? "justify-end" : "justify-start"}`}>
                          <Button
                            appearance="transparent"
                            size="small"
                            className="uppercase tracking-wider text-xs font-bold text-neutral-400"
                            iconPosition="after"
                            icon={
                              connections.sortKey === column.key ? (
                                connections.sortDirection === "asc" ? <ChevronUpRegular /> : <ChevronDownRegular />
                              ) : undefined
                            }
                            onClick={() => connections.toggleSort(column.key)}
                          >
                            {column.label}
                          </Button>
                        </div>
                      </th>
                    ))}
                    <th className="border-b border-neutral-700 px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-neutral-400">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {connections.visibleConnections.length === 0 ? (
                    <tr>
                      <td
                        colSpan={connections.visibleColumns.length + 1}
                        className="px-6 py-16 text-center text-sm text-neutral-500"
                      >
                        No connections matched the current filters.
                      </td>
                    </tr>
                  ) : connections.groupedColumn ? (
                    connections.groupedVisibleConnections.map((group) => (
                      <React.Fragment key={group.id}>
                        <tr
                          className="cursor-pointer bg-neutral-700/50 hover:bg-neutral-700 transition-colors"
                          onClick={() => connections.toggleGroupCollapsed(group.id)}
                        >
                          <td colSpan={connections.visibleColumns.length + 1} className="border-b border-neutral-700/50 px-4 py-2.5">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                {connections.isGroupCollapsed(group.id) ? <ChevronDownRegular className="text-neutral-400" /> : <ChevronUpRegular className="text-neutral-400" />}
                                <Text weight="semibold" className="text-neutral-300">
                                  {group.column.label}: {group.label}
                                </Text>
                              </div>
                              <Badge appearance="outline" shape="rounded" color="subtle">
                                {group.items.length} item{group.items.length === 1 ? "" : "s"}
                              </Badge>
                            </div>
                          </td>
                        </tr>
                        {!connections.isGroupCollapsed(group.id) &&
                          group.items.map((connection) => (
                            <tr
                              key={connection.id}
                              className="cursor-pointer bg-neutral-800 transition-colors hover:bg-neutral-700/30"
                              onClick={() => connections.openDetails(connection)}
                            >
                              {connections.visibleColumns.map((column) => (
                                <td
                                  key={`${connection.id}-${column.key}`}
                                  className={`border-b border-neutral-700/50 px-4 py-3 align-top ${
                                    column.align === "end" ? "text-right" : "text-left"
                                  }`}
                                >
                                  <ConnectionTableCell columnKey={column.key} connection={connection} />
                                </td>
                              ))}
                              <td className="border-b border-neutral-700/50 px-4 py-3 text-right align-top">
                                {connections.currentTab === "active" && (
                                  <Button
                                    appearance="transparent"
                                    icon={<DismissRegular className="text-red-500" />}
                                    disabled={connections.activeDisconnectIds.includes(connection.id)}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void connections.disconnectConnection(connection.id);
                                    }}
                                  />
                                )}
                              </td>
                            </tr>
                          ))}
                      </React.Fragment>
                    ))
                  ) : (
                    connections.visibleConnections.map((connection) => (
                      <tr
                        key={connection.id}
                        className="cursor-pointer bg-neutral-800 transition-colors hover:bg-neutral-700/30"
                        onClick={() => connections.openDetails(connection)}
                      >
                        {connections.visibleColumns.map((column) => (
                          <td
                            key={`${connection.id}-${column.key}`}
                            className={`border-b border-neutral-700/50 px-4 py-3 align-top ${
                              column.align === "end" ? "text-right" : "text-left"
                            }`}
                          >
                            <ConnectionTableCell columnKey={column.key} connection={connection} />
                          </td>
                        ))}
                        <td className="border-b border-neutral-700/50 px-4 py-3 text-right align-top">
                          {connections.currentTab === "active" && (
                            <Button
                              appearance="transparent"
                              icon={<DismissRegular className="text-red-500" />}
                              disabled={connections.activeDisconnectIds.includes(connection.id)}
                              onClick={(e) => {
                                e.stopPropagation();
                                void connections.disconnectConnection(connection.id);
                              }}
                            />
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <ConnectionDetailsModal
        open={connections.detailsOpen}
        connection={connections.selectedConnection}
        onClose={connections.closeDetails}
        onDisconnect={(id) => void connections.disconnectConnection(id)}
      />
    </div>
  );
}

