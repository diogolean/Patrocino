import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { publicMediaAllowed } from "@/lib/public-media";

const roots = [process.env.MEDIA_ROOT, "/opt/patrocino/media", "/tmp/patrocino-media"].filter(
  (root): root is string => Boolean(root),
);

function contentType(file: string) {
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".webp")) return "image/webp";
  if (file.endsWith(".gif")) return "image/gif";
  if (file.endsWith(".mp4")) return "video/mp4";
  if (file.endsWith(".webm")) return "video/webm";
  if (file.endsWith(".mov")) return "video/quicktime";
  return "image/jpeg";
}

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const parts = (await context.params).path;
  if (!publicMediaAllowed(parts)) {
    return new NextResponse(null, { status: 404 });
  }
  const relative = parts.join("/");
  for (const root of roots) {
    const base = path.resolve(root);
    const absolute = path.resolve(base, relative);
    if (absolute !== base && !absolute.startsWith(base + path.sep)) continue;
    try {
      await access(absolute);
      const info = await stat(absolute);
      if (!info.isFile()) continue;
      const stream = Readable.toWeb(createReadStream(absolute)) as ReadableStream;
      return new NextResponse(stream, {
        headers: {
          "content-type": contentType(absolute),
          "content-length": String(info.size),
          "cache-control": "public, max-age=3600",
          "x-content-type-options": "nosniff",
        },
      });
    } catch {
      continue;
    }
  }
  return new NextResponse(null, { status: 404, headers: { "cache-control": "no-store" } });
}
