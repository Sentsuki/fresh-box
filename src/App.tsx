import { FluentProvider } from "@fluentui/react-components";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { ErrorBoundary } from "./components/global/ErrorBoundary";
import { GlobalToaster } from "./components/global/GlobalToaster";
import { PageTransition } from "./components/layout/PageTransition";
import { Sidebar } from "./components/layout/Sidebar";
import { TitleBar } from "./components/layout/TitleBar";
import { Spinner } from "./components/ui/Spinner";
import { initializeApp } from "./hooks/useInit";
import { useTheme } from "./hooks/useTheme";
import { useToast } from "./hooks/useToast";
import { listProfiles, openExternalUrl } from "./services/api";
import { useConfigStore } from "./stores/configStore";
import { useUpdateStore } from "./stores/updateStore";
import type { UpdateInfo } from "./types/app";
import Connections from "./pages/Connections";
import Advanced from "./pages/Advanced";
import Logs from "./pages/Logs";
import Overview from "./pages/Overview";
import Profiles from "./pages/Profiles";
import Proxies from "./pages/Proxies";
import Settings from "./pages/Settings";
import { useAppStore } from "./stores/appStore";
import { useProxyStore } from "./stores/proxyStore";
import { useDaemonConnectionListener } from "./hooks/useDaemonConnection";
import { useWindowVisibilityListener } from "./hooks/useWindowVisibility";

function LoadingScreen() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-(--wb-surface-base)">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <span className="text-sm text-(--wb-text-secondary)">Loading...</span>
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
    case "profiles":
      return <Profiles />;
    case "advanced":
      return <Advanced />;
    case "settings":
      return <Settings />;
    default:
      return <Overview />;
  }
}

export default function App() {
  const initialized = useAppStore((s) => s.initialized);
  const currentPage = useAppStore((s) => s.currentPage);
  const fluentTheme = useTheme();
  const toast = useToast();
  useWindowVisibilityListener();
  useDaemonConnectionListener();

  useEffect(() => {
    void initializeApp().catch((err: unknown) => {
      console.error("Failed to initialize:", err);
      useAppStore.getState().markInitialized();
    });
  }, []);

  useEffect(() => {
    const unlisten = listen("tray-proxy-switched", () => {
      void useProxyStore.getState().refreshOverview(false);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // The backend's background auto-update scheduler (see
  // `spawn_auto_update_scheduler`) fires this after refreshing one or more
  // subscriptions on its own, with no user action involved — refetch so
  // the Profiles page's `lastUpdated` timestamps (and the config's actual
  // content) don't sit stale until the user happens to navigate away and
  // back.
  useEffect(() => {
    const unlisten = listen("profiles-auto-updated", () => {
      void listProfiles().then((profiles) =>
        useConfigStore.getState().setProfiles(profiles),
      );
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // `main.rs`'s one-shot startup check (`spawn_startup_update_check`) fires
  // this if it finds a newer GitHub release — detection only, see
  // `UpdateInfo`'s doc comment. Recorded in `useUpdateStore` so Settings'
  // "Check for Updates" card reflects it too, and surfaced immediately as
  // an actionable toast so it isn't only discoverable by opening Settings.
  useEffect(() => {
    const unlisten = listen<UpdateInfo>("update-available", (event) => {
      const info = event.payload;
      useUpdateStore.getState().setInfo(info);
      if (info.latestVersion) {
        toast.updateAvailable(info.latestVersion, () => {
          if (info.releaseUrl) void openExternalUrl(info.releaseUrl);
        });
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!initialized) {
    return (
      <FluentProvider
        theme={fluentTheme}
        style={{ height: "100%", background: "transparent" }}
      >
        <LoadingScreen />
      </FluentProvider>
    );
  }

  return (
    <FluentProvider
      theme={fluentTheme}
      style={{ height: "100%", background: "transparent" }}
    >
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
