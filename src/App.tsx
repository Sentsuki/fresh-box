import { useEffect } from "react";
import { FluentProvider } from "@fluentui/react-components";
import { useAppStore } from "./stores/appStore";
import { useInit } from "./hooks/useInit";
import { useTheme } from "./hooks/useTheme";
import { TitleBar } from "./components/layout/TitleBar";
import { Sidebar } from "./components/layout/Sidebar";
import { PageTransition } from "./components/layout/PageTransition";
import { GlobalToaster } from "./components/global/GlobalToaster";
import { ErrorBoundary } from "./components/global/ErrorBoundary";
import { Spinner } from "./components/ui/Spinner";
import Overview from "./pages/Overview";
import Proxies from "./pages/Proxies";
import Connections from "./pages/Connections";
import Logs from "./pages/Logs";
import Rules from "./pages/Rules";
import Config from "./pages/Config";
import Custom from "./pages/Custom";
import Settings from "./pages/Settings";

function LoadingScreen() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-(--wb-surface-base)">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <span className="text-sm text-(--wb-text-secondary)">
          Loading...
        </span>
      </div>
    </div>
  );
}

function PageContent({ page }: { page: string }) {
  switch (page) {
    case "overview":
      return <Overview />;
    case "proxy":
      return <Proxies />;
    case "connections":
      return <Connections />;
    case "logs":
      return <Logs />;
    case "rules":
      return <Rules />;
    case "config":
      return <Config />;
    case "custom":
      return <Custom />;
    case "settings":
      return <Settings />;
    default:
      return <Overview />;
  }
}

export default function App() {
  const initialized = useAppStore((s) => s.initialized);
  const currentPage = useAppStore((s) => s.currentPage);
  const { initialize } = useInit();
  const fluentTheme = useTheme();

  useEffect(() => {
    void initialize().catch((err: unknown) => {
      console.error("Failed to initialize:", err);
      useAppStore.getState().markInitialized();
    });
  }, []);

  if (!initialized) {
    return (
      <FluentProvider theme={fluentTheme} style={{ height: "100%", background: "transparent" }}>
        <LoadingScreen />
      </FluentProvider>
    );
  }

  return (
    <FluentProvider theme={fluentTheme} style={{ height: "100%", background: "transparent" }}>
    <div
      className="flex flex-col h-full w-full overflow-hidden"
      style={{ background: "var(--wb-surface-base)" }}
    >
      <TitleBar />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-hidden flex flex-col bg-(--wb-surface-base) border-t border-l border-(--wb-border-subtle)">
          <PageTransition pageKey={currentPage}>
            <div className="flex-1 overflow-y-auto p-5">
              <ErrorBoundary key={currentPage}>
                <PageContent page={currentPage} />
              </ErrorBoundary>
            </div>
          </PageTransition>
        </main>
      </div>
      <GlobalToaster />
    </div>
    </FluentProvider>
  );
}
