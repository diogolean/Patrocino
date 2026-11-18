import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { publicMediaAllowed } from "@/lib/public-media";

const roots = [process.env.MEDIA_ROOT, path.join(process.cwd(), "public"), path.join(process.cwd(), "apps/web/public")].filter(
  (root): root is string => Boolean(root),
);

export function publicOgSource(src: string | null | undefined) {
  if (!src || src.includes("/private/") || src.includes("/tmp/")) return null;
  return src.split("?")[0] || null;
}

async function readPublicFile(src: string): Promise<{ bytes: Buffer; type: string } | null> {
  const bare = publicOgSource(src);
  if (!bare) return null;
  if (bare.startsWith("/media/")) {
    const parts = bare.replace(/^\/media\//, "").split("/").filter(Boolean);
    if (!publicMediaAllowed(parts)) return null;
    for (const root of roots) {
      try {
        const bytes = await readFile(path.join(root, ...parts));
        const type = bare.endsWith(".png") ? "image/png" : bare.endsWith(".webp") ? "image/webp" : "image/jpeg";
        return { bytes, type };
      } catch {
        continue;
      }
    }
    return null;
  }
  if (bare.startsWith("/") && !bare.startsWith("//")) {
    for (const root of roots) {
      try {
        const bytes = await readFile(path.join(root, bare.replace(/^\//, "")));
        return { bytes, type: bare.endsWith(".png") ? "image/png" : "image/jpeg" };
      } catch {
        continue;
      }
    }
  }
  return null;
}

export async function creatorOgResponse(input: { name: string; image: string | null | undefined }) {
  const file = await readPublicFile(input.image ?? "");
  if (file) {
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "content-type": file.type,
        "cache-control": "public, max-age=86400",
        "x-content-type-options": "nosniff",
      },
    });
  }
  const card = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "flex-end", background: "#181725", color: "white", fontSize: 64, fontWeight: 700, padding: 48 }}>
        {input.name || "Patrocino"}
      </div>
    ),
    { width: 1200, height: 630 },
  );
  card.headers.set("cache-control", "public, max-age=86400");
  return card;
}
