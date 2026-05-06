import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowMinimizeRegular, MaximizeRegular, DismissRegular } from "@fluentui/react-icons";
import { useSettingsStore } from "../../stores/settingsStore";

const appWindow = getCurrentWindow();

export function TitleBar() {
  const currentPage = useSettingsStore((s) => s.settings.app.current_page);

  const pageTitle: Record<string, string> = {
    overview: "Overview",
    proxy: "Proxies",
    connections: "Connections",
    logs: "Logs",
    rules: "Rules",
    config: "Config",
    custom: "Custom Rules",
    settings: "Settings",
  };

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between px-4 h-[var(--wb-titlebar-height)] bg-[var(--wb-surface-base)] border-b border-[var(--wb-border-subtle)] flex-shrink-0 select-none"
      style={{ height: "var(--wb-titlebar-height)" }}
    >
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 flex-1 min-w-0"
      >
        <span className="text-sm font-semibold text-[var(--wb-text-primary)]">
          Fresh Box
        </span>
        <span className="text-[var(--wb-text-tertiary)] text-sm">·</span>
        <span className="text-sm text-[var(--wb-text-secondary)] truncate">
          {pageTitle[currentPage] ?? currentPage}
        </span>
      </div>

      <div className="flex items-center flex-shrink-0">
        <button
          onClick={() => void appWindow.minimize()}
          className="flex items-center justify-center w-11 h-[var(--wb-titlebar-height)] text-[var(--wb-text-secondary)] hover:bg-[var(--wb-surface-hover)] transition-colors duration-100 focus-visible:outline-none"
          style={{ height: "var(--wb-titlebar-height)" }}
          aria-label="Minimize"
        >
          <ArrowMinimizeRegular className="text-base" />
        </button>
        <button
          onClick={() => void appWindow.toggleMaximize()}
          className="flex items-center justify-center w-11 h-[var(--wb-titlebar-height)] text-[var(--wb-text-secondary)] hover:bg-[var(--wb-surface-hover)] transition-colors duration-100 focus-visible:outline-none"
          style={{ height: "var(--wb-titlebar-height)" }}
          aria-label="Maximize"
        >
          <MaximizeRegular className="text-base" />
        </button>
        <button
          onClick={() => void appWindow.close()}
          className="flex items-center justify-center w-11 h-[var(--wb-titlebar-height)] text-[var(--wb-text-secondary)] hover:bg-red-600 hover:text-white transition-colors duration-100 focus-visible:outline-none"
          style={{ height: "var(--wb-titlebar-height)" }}
          aria-label="Close"
        >
          <DismissRegular className="text-base" />
        </button>
      </div>
    </div>
  );
}
