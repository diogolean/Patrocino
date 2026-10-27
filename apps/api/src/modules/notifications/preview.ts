const PREVIEW_LIMIT = 140;

export function messagePreview(body: string, max = PREVIEW_LIMIT) {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}
