import { viewerHandleLabel } from "@/lib/gallery";

export function watermarkStyle(handle: string) {
  const label = viewerHandleLabel(handle);
  if (!label) return undefined;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="168" height="104"><text x="6" y="68" fill="rgba(255,255,255,0.28)" font-size="13" font-family="sans-serif" transform="rotate(-28 84 52)">${label}</text></svg>`;
  return {
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    backgroundRepeat: "repeat",
  } as const;
}

export function paintWatermark(context: CanvasRenderingContext2D, width: number, height: number, handle: string) {
  const label = viewerHandleLabel(handle);
  if (!label) return;
  context.save();
  context.globalAlpha = 0.34;
  context.fillStyle = "#ffffff";
  context.font = "14px sans-serif";
  context.textAlign = "left";
  context.translate(width / 2, height / 2);
  context.rotate(-0.48);
  for (let y = -height; y <= height; y += 92) {
    for (let x = -width; x <= width; x += 156) {
      context.fillText(label, x, y);
    }
  }
  context.restore();
}
