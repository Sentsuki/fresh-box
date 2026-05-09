import {
  ArrowDownRegular,
  ArrowUpRegular,
  StorageRegular,
} from "@fluentui/react-icons";
import { Card } from "../../components/ui/Card";
import { useTrafficStore } from "../../hooks/useTrafficStream";
import { useMemoryStore } from "../../hooks/useMemoryStream";
import { formatBytes, formatSpeed } from "../../services/utils";
import type { ClashOverview } from "../../types/app";

interface StatusCardsProps {
  overview: ClashOverview;
}

export default function StatusCards({ overview: _overview }: StatusCardsProps) {
  const downloadSpeed = useTrafficStore((s) => s.downloadSpeed);
  const uploadSpeed = useTrafficStore((s) => s.uploadSpeed);
  const inuse = useMemoryStore((s) => s.inuse);

  const stats = [
    {
      icon: <ArrowDownRegular />,
      label: "Download",
      value: formatSpeed(downloadSpeed),
      sub: "Current speed",
      color: "text-(--wb-accent)",
    },
    {
      icon: <ArrowUpRegular />,
      label: "Upload",
      value: formatSpeed(uploadSpeed),
      sub: "Current speed",
      color: "text-(--wb-accent-hover)",
    },
    {
      icon: <StorageRegular />,
      label: "Memory",
      value: inuse > 0 ? formatBytes(inuse) : "—",
      sub: "Core heap in use",
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
