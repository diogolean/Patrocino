import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from "../../apps/web/lib/og-size";
import { creatorOgResponse } from "../../apps/web/lib/creator-og";

function pngSize(bytes: Buffer) {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("creator share image", () => {
  it("renders a 1200 by 630 card, including when the source photo is another size", async () => {
    const plain = await creatorOgResponse({ name: "Sophie Bennet", image: null });
    const plainBytes = Buffer.from(await plain.arrayBuffer());
    expect(plain.headers.get("content-type")).toContain("image/png");
    expect(pngSize(plainBytes)).toEqual({ width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT });

    const source = await readFile(path.join(process.cwd(), "apps/web/public/media/generated/creator-luna-ferraz-cover.jpg"));
    const covered = await creatorOgResponse({
      name: "Luna Ferraz",
      image: "/media/generated/creator-luna-ferraz-cover.jpg",
    });
    const coveredBytes = Buffer.from(await covered.arrayBuffer());
    expect(covered.headers.get("content-type")).toContain("image/png");
    expect(pngSize(coveredBytes)).toEqual({ width: 1200, height: 630 });
    expect(coveredBytes.length).not.toBe(source.length);
  });
});
