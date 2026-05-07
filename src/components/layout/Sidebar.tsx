import { useCallback } from "react";
import {
  DataBarVerticalRegular,
  GlobeRegular,
  PlugConnectedRegular,
  DocumentTextRegular,
  BookNumberRegular,
  DocumentEditRegular,
  WrenchRegular,
  SettingsRegular,
} from "@fluentui/react-icons";
import { useAppStore } from "../../stores/appStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSingboxStore } from "../../stores/singboxStore";
import { StatusBadge } from "../ui/StatusBadge";
import type { AppPage } from "../../types/app";

const NAV_ITEMS = [
  { id: "overview" as AppPage, label: "Overview", icon: DataBarVerticalRegular },
  { id: "proxy" as AppPage, label: "Proxies", icon: GlobeRegular },
  { id: "connections" as AppPage, label: "Connections", icon: PlugConnectedRegular },
  { id: "logs" as AppPage, label: "Logs", icon: DocumentTextRegular },
  { id: "rules" as AppPage, label: "Rules", icon: BookNumberRegular },
  { id: "config" as AppPage, label: "Config", icon: DocumentEditRegular },
  { id: "custom" as AppPage, label: "Custom", icon: WrenchRegular },
] as const;

export function Sidebar() {
  const currentPage = useAppStore((s) => s.currentPage);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const setSettingsPage = useSettingsStore((s) => s.setCurrentPage);
  const isRunning = useSingboxStore((s) => s.isRunning);

  const navigate = useCallback(
    async (page: AppPage) => {
      setCurrentPage(page);
      await setSettingsPage(page);
    },
    [setCurrentPage, setSettingsPage],
  );

  return (
    <aside
      className="flex flex-col bg-(--wb-surface-base) border-r border-(--wb-border-subtle) flex-shrink-0"
      style={{ width: "var(--wb-sidebar-width)" }}
    >
      <div className="px-4 py-4 border-b border-(--wb-border-subtle)">
        <div className="text-base font-semibold text-(--wb-text-primary)">
          Fresh Box
        </div>
        <div className="text-xs text-(--wb-text-secondary) mt-0.5">
          sing-box client
        </div>
      </div>

      <nav className="flex-1 px-2 py-2 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => void navigate(item.id)}
              className={[
                "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-(--wb-radius-md) mb-0.5",
                "transition-colors duration-100 text-left relative",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--wb-accent)",
                active
                  ? "bg-(--wb-surface-selected) text-(--wb-text-primary)"
                  : "text-(--wb-text-secondary) hover:bg-(--wb-surface-hover) hover:text-(--wb-text-primary)",
              ].join(" ")}
            >
              {active && (
                <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-(--wb-accent) rounded-full" />
              )}
              <Icon className="flex-shrink-0 text-base" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-2 py-2 border-t border-(--wb-border-subtle)">
        <div className="px-3 py-2 mb-1">
          <StatusBadge running={isRunning} />
        </div>
        <button
          onClick={() => void navigate("settings")}
          className={[
            "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-(--wb-radius-md)",
            "transition-colors duration-100 text-left relative",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--wb-accent)",
            currentPage === "settings"
              ? "bg-(--wb-surface-selected) text-(--wb-text-primary)"
              : "text-(--wb-text-secondary) hover:bg-(--wb-surface-hover) hover:text-(--wb-text-primary)",
          ].join(" ")}
        >
          {currentPage === "settings" && (
            <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-(--wb-accent) rounded-full" />
          )}
          <SettingsRegular className="flex-shrink-0 text-base" />
          <span className="truncate">Settings</span>
        </button>
      </div>
    </aside>
  );
}
