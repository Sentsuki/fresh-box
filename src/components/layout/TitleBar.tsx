import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowMinimizeRegular, MaximizeRegular, DismissRegular } from "@fluentui/react-icons";
import { useAppStore } from "../../stores/appStore";

export function TitleBar() {
  const currentPage = useAppStore((s) => s.currentPage);

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
    <header
      data-tauri-drag-region
      className="flex items-center justify-between pl-4 bg-(--wb-surface-base) border-b border-(--wb-border-subtle) shrink-0 select-none relative z-50"
      style={{ height: "var(--wb-titlebar-height)" }}
    >
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 flex-1 min-w-0 h-full"
      >
        <span className="text-sm font-semibold text-(--wb-text-primary) pointer-events-none">
          Fresh Box
        </span>
        <span className="text-(--wb-text-tertiary) text-sm pointer-events-none">·</span>
        <span className="text-sm text-(--wb-text-secondary) truncate pointer-events-none">
          {pageTitle[currentPage] ?? currentPage}
        </span>
      </div>

      <div className="flex items-center shrink-0 h-full">
        <button
          onClick={() => { void getCurrentWindow().minimize(); }}
          className="flex items-center justify-center w-11 h-full text-(--wb-text-secondary) hover:bg-(--wb-surface-hover) transition-colors duration-100 focus-visible:outline-none"
          aria-label="Minimize"
        >
          <ArrowMinimizeRegular className="text-base" />
        </button>
        <button
          onClick={() => { void getCurrentWindow().toggleMaximize(); }}
          className="flex items-center justify-center w-11 h-full text-(--wb-text-secondary) hover:bg-(--wb-surface-hover) transition-colors duration-100 focus-visible:outline-none"
          aria-label="Maximize"
        >
          <MaximizeRegular className="text-base" />
        </button>
        <button
          onClick={() => { void getCurrentWindow().close(); }}
          className="flex items-center justify-center w-12 h-full text-(--wb-text-secondary) hover:bg-red-600 hover:text-white transition-colors duration-100 focus-visible:outline-none"
          aria-label="Close"
        >
          <DismissRegular className="text-base" />
        </button>
      </div>
    </header>
  );
}
