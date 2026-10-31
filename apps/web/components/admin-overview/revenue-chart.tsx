"use client";

import { useState } from "react";
import { areaPath, linePath, scalePoints } from "./chart-geometry";

type Point = { label: string; value: number; previous: number; valueText: string; previousText: string; sales: number };

/** Revenue over time vs. the previous period. Pointer events cover mouse and touch: tap or drag to inspect. */
export function RevenueChart({ points, salesLabel, previousLabel }: { points: Point[]; salesLabel: (count: number) => string; previousLabel: string }) {
  const [active, setActive] = useState<number | null>(null);
  const width = 640;
  const height = 200;
  const max = Math.max(...points.map((point) => Math.max(point.value, point.previous)), 0);
  const current = scalePoints(points.map((point) => point.value), width, height, max, 10);
  const previous = scalePoints(points.map((point) => point.previous), width, height, max, 10);
  const shown = active ?? points.length - 1;
  const focus = points[shown];
  const pick = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    setActive(Math.round(ratio * (points.length - 1)));
  };
  const tickEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <div>
      {focus && (
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1" aria-live="polite">
          <span className="text-2xl font-semibold tabular-nums tracking-[-0.03em] text-foreground">{focus.valueText}</span>
          <span className="text-xs text-muted">{focus.label} · {salesLabel(focus.sales)}</span>
          <span className="text-xs text-muted/80">{previousLabel}: {focus.previousText}</span>
        </div>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-48 w-full touch-pan-y select-none sm:h-56"
        onPointerDown={pick}
        onPointerMove={(event) => (event.pointerType === "mouse" || event.buttons ? pick(event) : undefined)}
        onPointerLeave={(event) => event.pointerType === "mouse" && setActive(null)}
        role="img"
        aria-label={focus ? `${focus.label}: ${focus.valueText}` : undefined}
        data-testid="revenue-chart"
      >
        <defs>
          <linearGradient id="revenue-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--primary)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((line) => (
          <line key={line} x1="0" x2={width} y1={height * line} y2={height * line} stroke="rgba(255,255,255,0.06)" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={linePath(previous)} fill="none" stroke="rgba(255,255,255,0.28)" strokeDasharray="4 4" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <path d={areaPath(current, height)} fill="url(#revenue-fill)" />
        <path d={linePath(current)} fill="none" stroke="var(--primary)" strokeWidth="2.25" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {current[shown] && (
          <line x1={current[shown][0]} x2={current[shown][0]} y1="0" y2={height} stroke="rgba(255,255,255,0.25)" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <div className="mt-2 flex justify-between text-[10px] tabular-nums text-muted">
        {points.map((point, index) => (index % tickEvery === 0 || index === points.length - 1 ? <span key={index}>{point.label}</span> : null))}
      </div>
    </div>
  );
}
