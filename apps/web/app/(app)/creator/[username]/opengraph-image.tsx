import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { creators } from "@/lib/gateway";
import { loadDatabaseProfile } from "@/lib/load-public-catalog";
import { publicMediaAllowed } from "@/lib/public-media";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function publicImage(src: string) {
  if (!src || src.includes("/private/") || src.includes("/tmp/")) return null;
  const bare = src.split("?")[0] ?? src;
  if (bare.startsWith("/media/")) {
    const parts = bare.replace(/^\/media\//, "").split("/").filter(Boolean);
    if (!publicMediaAllowed(parts)) return null;
    const root = process.env.MEDIA_ROOT || "/opt/patrocino/media";
    try {
      const bytes = await readFile(path.join(root, ...parts));
      return `data:image/jpeg;base64,${bytes.toString("base64")}`;
    } catch {
      return null;
    }
  }
  if (bare.startsWith("https://")) {
    try {
      const response = await fetch(bare, { signal: AbortSignal.timeout(2500) });
      if (!response.ok) return null;
      const type = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
      if (!type.startsWith("image/")) return null;
      const bytes = Buffer.from(await response.arrayBuffer());
      return `data:${type};base64,${bytes.toString("base64")}`;
    } catch {
      return null;
    }
  }
  return null;
}

export default async function CreatorOpenGraphImage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await loadDatabaseProfile(username);
  const fixture = creators.find((item) => item.username === username);
  const name = profile?.creator.name || fixture?.name || username;
  const picture = await publicImage(profile?.creator.cover || profile?.creator.avatar || fixture?.cover || fixture?.avatar || "");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#181725" }}>
        {picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={picture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : null}
        <div style={{ position: "absolute", left: 48, right: 48, bottom: 36, display: "flex", color: "white", fontSize: 64, fontWeight: 700 }}>
          {name}
        </div>
      </div>
    ),
    { ...size },
  );
}
