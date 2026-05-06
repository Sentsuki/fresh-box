import { useMemo } from "react";
import {
  Card,
  Text,
  Button,
  Badge,
  makeStyles,
  shorthands,
} from "@fluentui/react-components";
import {
  PlayRegular,
  StopRegular,
  DocumentRegular,
  CloudArrowDownRegular,
  OpenRegular,
  CheckmarkCircleRegular,
  ErrorCircleRegular,
} from "@fluentui/react-icons";
import { useAppStore } from "../stores/appStore";
import { useSingbox } from "../hooks/useSingbox";

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    height: "100%",
  },
  card: {
    maxWidth: "400px",
  },
  statusHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  statusIcon: {
    fontSize: "32px",
  },
  statusContent: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
  },
  configInfo: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    ...shorthands.padding("12px"),
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    ...shorthands.borderRadius("6px"),
    marginTop: "16px",
  },
  configInfoLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  actions: {
    display: "flex",
    gap: "8px",
    marginTop: "16px",
  },
});

export default function Overview() {
  const styles = useStyles();
  const isRunning = useAppStore((state) => state.isRunning);
  const pendingOperations = useAppStore((state) => state.pendingOperations);
  const selectedConfigDisplay = useAppStore((state) => state.appSettings.app.selected_config_display);
  const selectedConfigPath = useAppStore((state) => state.appSettings.app.selected_config_path);
  const subscriptions = useAppStore((state) => state.subscriptions);
  
  const { startService, stopService, openPanel } = useSingbox();

  const isLoading = pendingOperations > 0;
  const isSubscription = useMemo(() => {
    return !!(selectedConfigDisplay && subscriptions[selectedConfigDisplay]);
  }, [selectedConfigDisplay, subscriptions]);

  return (
    <div className={styles.container}>
      <Text size={600} weight="semibold">Overview</Text>
      
      <Card className={styles.card}>
        <div className={styles.statusHeader}>
          <div className={styles.statusIcon} style={{ color: isRunning ? "var(--colorPaletteGreenForeground1)" : "var(--colorNeutralForeground3)" }}>
            {isRunning ? <CheckmarkCircleRegular /> : <ErrorCircleRegular />}
          </div>
          <div className={styles.statusContent}>
            <Text weight="semibold" size={400}>
              {isRunning ? "Service Running" : "Service Stopped"}
            </Text>
            <Text size={200} className="opacity-70">
              {isRunning ? "Sing-box is active and ready" : "Click start to begin"}
            </Text>
          </div>
          <Badge
            color={isRunning ? "success" : "subtle"}
            appearance={isRunning ? "filled" : "ghost"}
            onClick={isRunning ? openPanel : undefined}
            icon={isRunning ? <OpenRegular /> : undefined}
            style={{ cursor: isRunning ? "pointer" : "default" }}
          >
            {isRunning ? "PANEL" : "INACTIVE"}
          </Badge>
        </div>

        {selectedConfigDisplay && (
          <div className={styles.configInfo}>
            <div className={styles.configInfoLeft}>
              {isSubscription ? <CloudArrowDownRegular /> : <DocumentRegular />}
              <Text truncate>{selectedConfigDisplay}</Text>
            </div>
            <Badge appearance="outline" color={isSubscription ? "brand" : "subtle"}>
              {isSubscription ? "Subscription" : "Local"}
            </Badge>
          </div>
        )}

        <div className={styles.actions}>
          <Button
            appearance="primary"
            icon={<PlayRegular />}
            disabled={isRunning || isLoading || !selectedConfigPath}
            onClick={startService}
          >
            {isLoading && !isRunning ? "Starting..." : "Start"}
          </Button>
          <Button
            icon={<StopRegular />}
            disabled={!isRunning || isLoading}
            onClick={stopService}
          >
            {isLoading && isRunning ? "Stopping..." : "Stop"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
