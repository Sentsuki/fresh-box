import { Suspense, lazy, useEffect } from "react";
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

const Overview = lazy(() => import("./pages/Overview"));
const Proxies = lazy(() => import("./pages/Proxies"));
const Connections = lazy(() => import("./pages/Connections"));
const Logs = lazy(() => import("./pages/Logs"));
const Rules = lazy(() => import("./pages/Rules"));
const Config = lazy(() => import("./pages/Config"));
const Custom = lazy(() => import("./pages/Custom"));
const Settings = lazy(() => import("./pages/Settings"));

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

function PageSuspense({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      }
    >
      {children}
    </Suspense>
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
                <PageSuspense>
                  <PageContent page={currentPage} />
                </PageSuspense>
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
