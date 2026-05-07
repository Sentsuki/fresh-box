import { useState, useEffect } from "react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { useConnectionsStore } from "../../hooks/useConnectionsStream";
import { formatSpeed } from "../../services/utils";

const MAX_POINTS = 60;

interface DataPoint {
  dl: number;
  ul: number;
  tick: number;
}

function formatYAxis(value: number): string {
  if (value === 0) return "0";
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(0)}M`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)}K`;
  return `${value}`;
}

export default function TrafficChart() {
  const totalDownloadSpeed = useConnectionsStore((s) => s.totalDownloadSpeed);
  const totalUploadSpeed = useConnectionsStore((s) => s.totalUploadSpeed);
  const [history, setHistory] = useState<DataPoint[]>([]);

  useEffect(() => {
    setHistory((prev) => {
      const next = [
        ...prev,
        { dl: totalDownloadSpeed, ul: totalUploadSpeed, tick: Date.now() },
      ];
      return next.length > MAX_POINTS ? next.slice(next.length - MAX_POINTS) : next;
    });
  }, [totalDownloadSpeed, totalUploadSpeed]);

  return (
    <div className="rounded-(--wb-radius-lg) border border-(--wb-border-subtle) bg-(--wb-surface-layer) p-3">
      <div className="flex items-center gap-4 mb-2">
        <span className="text-xs text-(--wb-text-secondary)">Traffic (last 60s)</span>
        <span className="text-xs font-medium" style={{ color: "#60CDFF" }}>
          ▼ {formatSpeed(totalDownloadSpeed)}
        </span>
        <span className="text-xs font-medium" style={{ color: "#8CD7FF" }}>
          ▲ {formatSpeed(totalUploadSpeed)}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={history} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="dlGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#60CDFF" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#60CDFF" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="ulGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8CD7FF" stopOpacity={0.08} />
              <stop offset="95%" stopColor="#8CD7FF" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[0, "auto"]} tickFormatter={formatYAxis} />
          <Tooltip
            contentStyle={{ display: "none" }}
            cursor={false}
          />
          <Area
            type="monotone"
            dataKey="dl"
            stroke="#60CDFF"
            strokeWidth={1.5}
            fill="url(#dlGrad)"
            dot={false}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="ul"
            stroke="#8CD7FF"
            strokeWidth={1.5}
            fill="url(#ulGrad)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
