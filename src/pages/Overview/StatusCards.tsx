import { Card } from "../../components/ui/Card";
import { formatBytes, formatSpeed } from "../../services/utils";
import type { ClashOverview } from "../../types/app";
import { useConnectionsStore } from "../../hooks/useConnectionsStream";
import {
  ArrowDownRegular,
  ArrowUpRegular,
  PlugConnectedRegular,
  StorageRegular,
} from "@fluentui/react-icons";

interface StatusCardsProps {
  overview: ClashOverview;
}

export default function StatusCards({ overview }: StatusCardsProps) {
  const active = useConnectionsStore((s) => s.active);
  const downloadTotal = useConnectionsStore((s) => s.downloadTotal);
  const uploadTotal = useConnectionsStore((s) => s.uploadTotal);

  const downloadSpeed = active.reduce((sum, c) => sum + c.downloadSpeed, 0);
  const uploadSpeed = active.reduce((sum, c) => sum + c.uploadSpeed, 0);
  const connectionsCount = active.length;

  const stats = [
    {
      icon: <ArrowDownRegular />,
      label: "Download",
      value: formatSpeed(downloadSpeed),
      sub: `Total: ${formatBytes(downloadTotal)}`,
      color: "text-(--wb-accent)",
    },
    {
      icon: <ArrowUpRegular />,
      label: "Upload",
      value: formatSpeed(uploadSpeed),
      sub: `Total: ${formatBytes(uploadTotal)}`,
      color: "text-(--wb-accent-hover)",
    },
    {
      icon: <PlugConnectedRegular />,
      label: "Connections",
      value: String(connectionsCount),
      sub: `Mode: ${overview.current_mode}`,
      color: "text-(--wb-success)",
    },
    ...(overview.memory_usage !== undefined
      ? [
          {
            icon: <StorageRegular />,
            label: "Memory",
            value: formatBytes(overview.memory_usage),
            sub: "In use",
            color: "text-(--wb-warning)",
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-wrap gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className="flex-1 min-w-[200px]">
          <Card className="h-full">
            <div className="flex items-center gap-4">
              <div className={["text-2xl flex-shrink-0", stat.color].join(" ")}>
                {stat.icon}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-(--wb-text-secondary) font-medium">
                  {stat.label}
                </p>
                <p className="text-xl font-bold text-(--wb-text-primary) leading-tight mt-0.5">
                  {stat.value}
                </p>
                {stat.sub && (
                  <p className="text-[11px] text-(--wb-text-tertiary) mt-0.5 truncate">
                    {stat.sub}
                  </p>
                )}
              </div>
            </div>
          </Card>
        </div>
      ))}
    </div>
  );
}
