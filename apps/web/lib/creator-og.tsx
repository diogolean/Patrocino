import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from "@/lib/og-size";
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

function dataUri(file: { bytes: Buffer; type: string }) {
  return `data:${file.type};base64,${file.bytes.toString("base64")}`;
}

export async function creatorOgResponse(input: { name: string; image: string | null | undefined }) {
  const file = await readPublicFile(input.image ?? "");
  const picture = file && file.type !== "image/webp" ? dataUri(file) : null;
  const card = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-end",
          background: "#181725",
          color: "white",
          fontSize: 64,
          fontWeight: 700,
        }}
      >
        {picture ? (
          <img
            alt=""
            src={picture}
            width={OG_IMAGE_WIDTH}
            height={OG_IMAGE_HEIGHT}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ display: "flex", padding: 48 }}>{input.name || "Patrocino"}</div>
        )}
      </div>
    ),
    { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT },
  );
  card.headers.set("cache-control", "public, max-age=86400");
  card.headers.set("x-content-type-options", "nosniff");
  return card;
}
