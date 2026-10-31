/** Pure helpers that turn a numeric series into SVG paths (kept separate so they are easy to test). */
export function scalePoints(values: number[], width: number, height: number, max: number, pad = 4) {
  const top = Math.max(max, 1);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((value, index) => [values.length > 1 ? index * step : width / 2, pad + (height - pad * 2) * (1 - value / top)] as const);
}

export function linePath(points: readonly (readonly [number, number])[]) {
  return points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

export function areaPath(points: readonly (readonly [number, number])[], height: number) {
  if (!points.length) return "";
  return `${linePath(points)} L${points.at(-1)![0].toFixed(1)},${height} L${points[0]![0].toFixed(1)},${height} Z`;
}
