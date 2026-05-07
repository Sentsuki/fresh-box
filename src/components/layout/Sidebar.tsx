import { useCallback, useState, useEffect } from "react";
import {
  DataBarVerticalRegular,
  GlobeRegular,
  PlugConnectedRegular,
  DocumentTextRegular,
  BookNumberRegular,
  DocumentEditRegular,
  WrenchRegular,
  SettingsRegular,
  NavigationRegular,
} from "@fluentui/react-icons";
import { useAppStore } from "../../stores/appStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSingboxStore } from "../../stores/singboxStore";
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
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Auto-collapse on small screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 800) {
        setIsCollapsed(true);
      } else {
        setIsCollapsed(false);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const navigate = useCallback(
    async (page: AppPage) => {
      setCurrentPage(page);
      await setSettingsPage(page);
    },
    [setCurrentPage, setSettingsPage],
  );

  return (
    <aside
      className="flex flex-col bg-(--wb-surface-base) border-r border-(--wb-border-subtle) shrink-0 transition-all duration-200 ease-in-out"
      style={{ 
        width: isCollapsed ? "var(--wb-sidebar-collapsed-width)" : "var(--wb-sidebar-width)",
        fontFamily: "var(--wb-font-base)"
      }}
    >
      <div className="flex flex-col gap-2 p-2">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-2 rounded-(--wb-radius-md) hover:bg-(--wb-surface-hover) active:bg-(--wb-surface-active) text-(--wb-text-primary) transition-colors"
          title="Toggle Navigation"
        >
          <NavigationRegular className="text-lg" />
        </button>

        {!isCollapsed && (
          <div className="px-2 py-1 mb-2">
            <div className="text-sm font-semibold text-(--wb-text-primary) truncate">
              Fresh Box
            </div>
            <div className="text-[10px] text-(--wb-text-tertiary) uppercase tracking-wider font-bold">
              {isRunning ? "Running" : "Stopped"}
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 px-1.5 py-1 overflow-y-auto overflow-x-hidden space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => void navigate(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={[
                "w-full flex items-center gap-3 px-2.5 py-2 text-sm rounded-(--wb-radius-md) relative transition-all duration-75",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--wb-accent)",
                active
                  ? "bg-(--wb-surface-selected) text-(--wb-text-primary)"
                  : "text-(--wb-text-secondary) hover:bg-(--wb-surface-hover) hover:text-(--wb-text-primary)",
              ].join(" ")}
            >
              {active && (
                <span className="absolute left-0 top-2 bottom-2 w-1 bg-(--wb-accent) rounded-r-full" />
              )}
              <Icon className="shrink-0 text-lg" />
              {!isCollapsed && <span className="truncate flex-1">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="p-1.5 border-t border-(--wb-border-subtle)">
        <button
          onClick={() => void navigate("settings")}
          title={isCollapsed ? "Settings" : undefined}
          className={[
            "w-full flex items-center gap-3 px-2.5 py-2 text-sm rounded-(--wb-radius-md) relative transition-all duration-75",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--wb-accent)",
            currentPage === "settings"
              ? "bg-(--wb-surface-selected) text-(--wb-text-primary)"
              : "text-(--wb-text-secondary) hover:bg-(--wb-surface-hover) hover:text-(--wb-text-primary)",
          ].join(" ")}
        >
          {currentPage === "settings" && (
            <span className="absolute left-0 top-2 bottom-2 w-1 bg-(--wb-accent) rounded-r-full" />
          )}
          <SettingsRegular className="shrink-0 text-lg" />
          {!isCollapsed && <span className="truncate flex-1">Settings</span>}
        </button>
      </div>
    </aside>
  );
}

