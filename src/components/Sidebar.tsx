import { useAppStore } from "../stores/appStore";
import type { AppPage } from "../types/app";
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
import { Button, makeStyles, shorthands } from "@fluentui/react-components";

const useStyles = makeStyles({
  sidebar: {
    width: "260px",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "transparent",
    ...shorthands.padding("16px", "12px"),
  },
  header: {
    ...shorthands.padding("8px", "12px", "24px", "12px"),
  },
  title: {
    fontSize: "18px",
    fontWeight: "600",
    marginBottom: "4px",
  },
  subtitle: {
    fontSize: "12px",
    opacity: 0.7,
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  navItem: {
    justifyContent: "flex-start",
    fontWeight: "normal",
    ...shorthands.padding("8px", "12px"),
  },
  navItemActive: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    "&:hover": {
      backgroundColor: "rgba(255, 255, 255, 0.08)",
    }
  }
});

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: <DataBarVerticalRegular /> },
  { id: "proxy", label: "Proxies", icon: <GlobeRegular /> },
  { id: "connections", label: "Connections", icon: <PlugConnectedRegular /> },
  { id: "logs", label: "Logs", icon: <DocumentTextRegular /> },
  { id: "rules", label: "Rules", icon: <BookNumberRegular /> },
  { id: "config", label: "Config", icon: <DocumentEditRegular /> },
  { id: "custom", label: "Custom", icon: <WrenchRegular /> },
  { id: "settings", label: "Settings", icon: <SettingsRegular /> },
] as const;

export default function Sidebar() {
  const styles = useStyles();
  const currentPage = useAppStore((state) => state.appSettings.app.current_page);
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.title}>Fresh Box</div>
        <div className={styles.subtitle}>sing-box Client</div>
      </div>
      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <Button
            key={item.id}
            appearance={currentPage === item.id ? "subtle" : "transparent"}
            icon={item.icon}
            className={`${styles.navItem} ${currentPage === item.id ? styles.navItemActive : ''}`}
            onClick={() => setCurrentPage(item.id as AppPage)}
          >
            {item.label}
          </Button>
        ))}
      </nav>
    </div>
  );
}
