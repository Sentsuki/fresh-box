import { FluentProvider } from "@fluentui/react-components";
import { useEffect } from "react";
import { ErrorBoundary } from "./components/global/ErrorBoundary";
import { GlobalToaster } from "./components/global/GlobalToaster";
import { PageTransition } from "./components/layout/PageTransition";
import { Sidebar } from "./components/layout/Sidebar";
import { TitleBar } from "./components/layout/TitleBar";
import { Spinner } from "./components/ui/Spinner";
import { useInit } from "./hooks/useInit";
import { useTheme } from "./hooks/useTheme";
import Connections from "./pages/Connections";
import Custom from "./pages/Custom";
import Logs from "./pages/Logs";
import Overview from "./pages/Overview";
import Profiles from "./pages/Profiles";
import Proxies from "./pages/Proxies";
import Rules from "./pages/Rules";
import Settings from "./pages/Settings";
import { useAppStore } from "./stores/appStore";

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
    case "profiles":
      return <Profiles />;
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
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-7xl mx-auto w-full p-5">
                  <ErrorBoundary key={currentPage}>
                    <PageContent page={currentPage} />
                  </ErrorBoundary>
                </div>
              </div>
            </PageTransition>
          </main>
        </div>
        <GlobalToaster />
      </div>
    </FluentProvider>
  );
}
