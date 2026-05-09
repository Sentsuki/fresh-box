import {
  ArrowDownRegular,
  ArrowUpRegular,
  StorageRegular,
} from "@fluentui/react-icons";
import { Card } from "../../components/ui/Card";
import { useConnectionsStore } from "../../hooks/useConnectionsStream";
import { useMemoryStore } from "../../hooks/useMemoryStream";
import { useTrafficStore } from "../../hooks/useTrafficStream";
import { formatBytes, formatSpeed } from "../../services/utils";
import type { ClashOverview } from "../../types/app";

interface StatusCardsProps {
  overview: ClashOverview;
}

export default function StatusCards({ overview }: StatusCardsProps) {
  const downloadTotal = useConnectionsStore((s) => s.downloadTotal);
  const uploadTotal = useConnectionsStore((s) => s.uploadTotal);

  const downloadSpeed = useTrafficStore((s) => s.downloadSpeed);
  const uploadSpeed = useTrafficStore((s) => s.uploadSpeed);
  const memoryInUse = useMemoryStore((s) => s.memoryInUse);

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
      icon: <StorageRegular />,
      label: "Memory",
      value: formatBytes(memoryInUse),
      sub: `Mode: ${overview.current_mode}`,
      color: "text-(--wb-warning)",
    },
  ];

  return (
    <div className="flex flex-wrap gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className="flex-1 min-w-[200px]">
          <Card className="h-full">
            <div className="flex items-center gap-4">
              <div className={["text-2xl shrink-0", stat.color].join(" ")}>
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
