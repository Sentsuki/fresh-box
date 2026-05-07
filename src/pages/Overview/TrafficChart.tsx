import { useEffect, useMemo, useRef } from "react";
import { useConnectionsStore } from "../../hooks/useConnectionsStream";
import { formatSpeed } from "../../services/utils";

const MAX_POINTS = 60;

interface DataPoint {
  dl: number;
  ul: number;
}

const history: DataPoint[] = [];

export default function TrafficChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const active = useConnectionsStore((s) => s.active);

  const { downloadSpeed, uploadSpeed } = useMemo(() => {
    const dl = active.reduce((sum, c) => sum + c.downloadSpeed, 0);
    const ul = active.reduce((sum, c) => sum + c.uploadSpeed, 0);
    return { downloadSpeed: dl, uploadSpeed: ul };
  }, [active]);

  useEffect(() => {
    history.push({ dl: downloadSpeed, ul: uploadSpeed });
    if (history.length > MAX_POINTS) history.shift();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const max =
      Math.max(
        ...history.map((p) => Math.max(p.dl, p.ul)),
        1024,
      );

    function drawLine(
      points: number[],
      color: string,
      fillColor: string,
    ) {
      if (points.length < 2) return;
      const stepX = width / (MAX_POINTS - 1);

      ctx!.beginPath();
      points.forEach((val, i) => {
        const x = i * stepX;
        const y = height - (val / max) * (height - 16) - 4;
        if (i === 0) ctx!.moveTo(x, y);
        else ctx!.lineTo(x, y);
      });

      ctx!.strokeStyle = color;
      ctx!.lineWidth = 1.5;
      ctx!.stroke();

      // fill
      ctx!.lineTo(points.length * stepX - stepX, height);
      ctx!.lineTo(0, height);
      ctx!.closePath();
      ctx!.fillStyle = fillColor;
      ctx!.fill();
    }

    const dlPoints = history.map((p) => p.dl);
    const ulPoints = history.map((p) => p.ul);

    drawLine(dlPoints, "#60CDFF", "rgba(96,205,255,0.1)");
    drawLine(ulPoints, "#8CD7FF", "rgba(140,215,255,0.05)");

    // labels
    ctx.font = "10px Segoe UI Variable, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillText(
      `▼ ${formatSpeed(dlPoints[dlPoints.length - 1] ?? 0)}`,
      6,
      14,
    );
    ctx.fillText(
      `▲ ${formatSpeed(ulPoints[ulPoints.length - 1] ?? 0)}`,
      80,
      14,
    );
  }, [downloadSpeed, uploadSpeed]);

  return (
    <div className="rounded-[var(--wb-radius-lg)] border border-[var(--wb-border-subtle)] bg-[var(--wb-surface-layer)] p-3">
      <p className="text-xs text-[var(--wb-text-secondary)] mb-2">
        Traffic (last 60s)
      </p>
      <canvas
        ref={canvasRef}
        width={560}
        height={80}
        className="w-full h-20 block"
      />
    </div>
  );
}
