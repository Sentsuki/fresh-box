import { Card } from "../../components/ui/Card";
import { formatBytes, formatSpeed } from "../../services/utils";
import type { ClashOverview } from "../../types/app";
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
  const traffic = overview.traffic;

  const stats = [
    {
      icon: <ArrowDownRegular />,
      label: "Download",
      value: traffic ? formatSpeed(traffic.download) : "--",
      sub: traffic ? `Total: ${formatBytes(traffic.download_total)}` : "",
      color: "text-[#60CDFF]",
    },
    {
      icon: <ArrowUpRegular />,
      label: "Upload",
      value: traffic ? formatSpeed(traffic.upload) : "--",
      sub: traffic ? `Total: ${formatBytes(traffic.upload_total)}` : "",
      color: "text-[#8CD7FF]",
    },
    {
      icon: <PlugConnectedRegular />,
      label: "Connections",
      value:
        overview.connections_count !== undefined
          ? String(overview.connections_count)
          : "--",
      sub: `Mode: ${overview.current_mode}`,
      color: "text-[#6BB44A]",
    },
    ...(overview.memory_usage !== undefined
      ? [
          {
            icon: <StorageRegular />,
            label: "Memory",
            value: formatBytes(overview.memory_usage),
            sub: "In use",
            color: "text-[#FFD700]",
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
              <p className="text-xs text-[var(--wb-text-secondary)]">
                {stat.label}
              </p>
              <p className="text-lg font-semibold text-[var(--wb-text-primary)] leading-tight">
                {stat.value}
              </p>
              {stat.sub && (
                <p className="text-[11px] text-[var(--wb-text-tertiary)]">
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
