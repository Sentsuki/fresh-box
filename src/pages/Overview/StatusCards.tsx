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
    <div className="grid grid-cols-2 gap-3">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <div className="flex items-center gap-3">
            <div className={["text-xl flex-shrink-0", stat.color].join(" ")}>
              {stat.icon}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-(--wb-text-secondary)">
                {stat.label}
              </p>
              <p className="text-lg font-semibold text-(--wb-text-primary) leading-tight">
                {stat.value}
              </p>
              {stat.sub && (
                <p className="text-[11px] text-(--wb-text-tertiary)">
                  {stat.sub}
                </p>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
