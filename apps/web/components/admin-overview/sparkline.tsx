import { areaPath, linePath, scalePoints } from "./chart-geometry";

export function Sparkline({ values, id }: { values: number[]; id: string }) {
  const width = 120;
  const height = 32;
  const points = scalePoints(values, width, height, Math.max(...values, 0));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath(points, height)} fill={`url(#spark-${id})`} />
      <path d={linePath(points)} fill="none" stroke="var(--primary)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
