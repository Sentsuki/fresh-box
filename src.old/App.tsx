import { Suspense, lazy, useEffect } from "react";
import { useAppStore } from "./stores/appStore";
import { useConfigs } from "./hooks/useConfigs";
import { useSingbox } from "./hooks/useSingbox";
import Sidebar from "./components/Sidebar";
import GlobalToaster from "./components/GlobalToaster";

const Overview = lazy(() => import("./components/Overview"));
const Proxies = lazy(() => import("./components/Proxies"));
const Connections = lazy(() => import("./components/Connections"));
const Logs = lazy(() => import("./components/Logs"));
const Rules = lazy(() => import("./components/Rules"));
const Config = lazy(() => import("./components/Config"));
const Custom = lazy(() => import("./components/Custom"));
const Settings = lazy(() => import("./components/Settings"));

function LoadingView() {
  return <div className="flex h-full items-center justify-center">Loading...</div>;
}

export default function App() {
  const initialized = useAppStore((state) => state.initialized);
  const hydrateSettings = useAppStore((state) => state.hydrateSettings);
  const markInitialized = useAppStore((state) => state.markInitialized);
  const currentPage = useAppStore((state) => state.appSettings.app.current_page);
  
  const { initializeConfigs } = useConfigs();
  const { initializeSingbox } = useSingbox();

  useEffect(() => {
    async function init() {
      try {
        await hydrateSettings();
        await initializeConfigs();
        await initializeSingbox();
        markInitialized();
      } catch (error) {
        console.error("Failed to initialize app:", error);
      }
    }
    
    if (!initialized) {
      init();
    }
  }, [initialized, hydrateSettings, initializeConfigs, initializeSingbox, markInitialized]);

  if (!initialized) {
    return <LoadingView />;
  }

  const renderContent = () => {
    switch (currentPage) {
      case "overview": return <Overview />;
      case "proxy": return <Proxies />;
      case "connections": return <Connections />;
      case "logs": return <Logs />;
      case "rules": return <Rules />;
      case "config": return <Config />;
      case "custom": return <Custom />;
      case "settings": return <Settings />;
      default: return <Settings />;
    }
  };

  return (
    <div className="flex h-screen w-full bg-neutral-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 bg-neutral-800 rounded-tl-md border-t border-l border-neutral-700/50 shadow-inner overflow-y-auto">
        <div className="flex-1 p-6 relative">
          <Suspense fallback={<LoadingView />}>
            {renderContent()}
          </Suspense>
        </div>
      </main>
      <GlobalToaster />
    </div>
  );
}
