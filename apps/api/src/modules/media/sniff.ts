export type DetectedFile = {
  kind: "IMAGE" | "VIDEO";
  mimeType: string;
  extension: string;
};

const photoMaxBytes = Number(process.env.MEDIA_PHOTO_MAX_BYTES ?? 30 * 1024 * 1024);
const videoMaxBytes = Number(process.env.MEDIA_VIDEO_MAX_BYTES ?? 2_000_000_000);
export const chunkSizeBytes = Number(process.env.MEDIA_CHUNK_BYTES ?? 5 * 1024 * 1024);

export function maxBytes(kind: DetectedFile["kind"]) {
  return kind === "VIDEO" ? videoMaxBytes : photoMaxBytes;
}

export function detectFile(buffer: Buffer): DetectedFile | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { kind: "IMAGE", mimeType: "image/jpeg", extension: "jpg" };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { kind: "IMAGE", mimeType: "image/png", extension: "png" };
  }
  if (buffer.length >= 6 && (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a")) {
    return { kind: "IMAGE", mimeType: "image/gif", extension: "gif" };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return { kind: "IMAGE", mimeType: "image/webp", extension: "webp" };
  }
  if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { kind: "VIDEO", mimeType: "video/webm", extension: "webm" };
  }
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii");
    if (brand === "M4A " || brand === "M4B " || brand === "M4P ") return null;
    if (brand.startsWith("qt")) return { kind: "VIDEO", mimeType: "video/quicktime", extension: "mov" };
    return { kind: "VIDEO", mimeType: "video/mp4", extension: "mp4" };
  }
  return null;
}

export function servedMimeType(mimeType: string) {
  const value = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (value === "video/mp4" || value === "video/m4v" || value === "video/x-m4v") return "video/mp4";
  return mimeType;
}

export function declaredMimeMatches(declared: string, detected: DetectedFile) {
  const value = declared.toLowerCase().split(";")[0]?.trim() ?? "";
  if (!value || value === "application/octet-stream") return true;
  if (value === detected.mimeType) return true;
  if (
    detected.kind === "VIDEO" &&
    (value === "video/mp4" || value === "video/m4v" || value === "video/x-m4v" || value === "video/quicktime" || value === "video/webm")
  ) {
    return detected.mimeType.startsWith("video/");
  }
  if (detected.kind === "IMAGE" && value.startsWith("image/")) return detected.mimeType.startsWith("image/");
  return false;
}
