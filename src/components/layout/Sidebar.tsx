import {
  BookNumberRegular,
  DataBarVerticalRegular,
  DocumentEditRegular,
  DocumentTextRegular,
  GlobeRegular,
  NavigationRegular,
  PlugConnectedRegular,
  SettingsRegular,
  WrenchRegular,
} from "@fluentui/react-icons";
import { useCallback, useState } from "react";
import { useAppStore } from "../../stores/appStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSingboxStore } from "../../stores/singboxStore";
import type { AppPage } from "../../types/app";
import { StatusBadge } from "../ui/StatusBadge";

const NAV_ITEMS = [
  { id: "overview" as AppPage, label: "Overview", icon: DataBarVerticalRegular },
  { id: "proxy" as AppPage, label: "Proxies", icon: GlobeRegular },
  { id: "connections" as AppPage, label: "Connections", icon: PlugConnectedRegular },
  { id: "logs" as AppPage, label: "Logs", icon: DocumentTextRegular },
  { id: "rules" as AppPage, label: "Rules", icon: BookNumberRegular },
  { id: "profiles" as AppPage, label: "Profiles", icon: DocumentEditRegular },
  { id: "custom" as AppPage, label: "Custom", icon: WrenchRegular },
] as const;

export function Sidebar() {
  const currentPage = useAppStore((s) => s.currentPage);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const setSettingsPage = useSettingsStore((s) => s.setCurrentPage);
  const isRunning = useSingboxStore((s) => s.isRunning);

  const [isExpanded, setIsExpanded] = useState(true);

  const navigate = useCallback(
    async (page: AppPage) => {
      setCurrentPage(page);
      await setSettingsPage(page);
    },
    [setCurrentPage, setSettingsPage],
  );

  return (
    <aside
      className="flex flex-col bg-(--wb-surface-base) border-r border-(--wb-border-subtle) shrink-0 transition-[width] duration-200 ease-in-out"
      style={{ width: isExpanded ? "var(--wb-sidebar-width)" : "60px" }}
    >
      <div className="px-2 py-3 border-b border-(--wb-border-subtle) flex items-center h-[52px]">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="shrink-0 w-10 h-10 flex items-center justify-center rounded-(--wb-radius-md) text-(--wb-text-primary) hover:bg-(--wb-surface-hover) transition-colors"
          title="Toggle Navigation"
        >
          <NavigationRegular className="text-xl" />
        </button>
        {isExpanded && (
          <div className="ml-2 flex flex-col justify-center overflow-hidden whitespace-nowrap">
            <span className="text-sm font-semibold text-(--wb-text-primary) leading-tight">Fresh Box</span>
            <span className="text-[10px] text-(--wb-text-secondary) leading-tight">sing-box client</span>
          </div>
        )}
      </div>

      <nav className="flex-1 px-2 py-2 overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => void navigate(item.id)}
              title={!isExpanded ? item.label : undefined}
              className={[
                "w-full flex items-center gap-3 px-3 py-2 h-10 rounded-(--wb-radius-md) mb-0.5",
                "transition-colors duration-100 text-left relative",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--wb-accent)",
                active
                  ? "bg-(--wb-surface-selected) text-(--wb-text-primary)"
                  : "text-(--wb-text-secondary) hover:bg-(--wb-surface-hover) hover:text-(--wb-text-primary)",
              ].join(" ")}
            >
              {active && (
                <span className="absolute left-0 top-2 bottom-2 w-1 bg-(--wb-accent) rounded-full" />
              )}
              <Icon className="shrink-0 text-xl" />
              {isExpanded && <span className="truncate text-sm">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="px-2 py-2 border-t border-(--wb-border-subtle) overflow-x-hidden">
        <div className="mb-2 flex justify-start px-2">
          <StatusBadge running={isRunning} showLabel={isExpanded} />
        </div>
        <button
          onClick={() => void navigate("settings")}
          title={!isExpanded ? "Settings" : undefined}
          className={[
            "w-full flex items-center gap-3 px-3 py-2 h-10 rounded-(--wb-radius-md)",
            "transition-colors duration-100 text-left relative",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--wb-accent)",
            currentPage === "settings"
              ? "bg-(--wb-surface-selected) text-(--wb-text-primary)"
              : "text-(--wb-text-secondary) hover:bg-(--wb-surface-hover) hover:text-(--wb-text-primary)",
          ].join(" ")}
        >
          {currentPage === "settings" && (
            <span className="absolute left-0 top-2 bottom-2 w-1 bg-(--wb-accent) rounded-full" />
          )}
          <SettingsRegular className="shrink-0 text-xl" />
          {isExpanded && <span className="truncate text-sm">Settings</span>}
        </button>
      </div>
    </aside>
  );
}
