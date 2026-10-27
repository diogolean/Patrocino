import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureBlurredPreview, isPlaceholderPreview, writePosterAndPreview } from "../../apps/api/src/modules/media/derivatives";

function ffmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

describe("blurred video posters", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("uses a real blurred frame and replaces a blank placeholder", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "patrocino-preview-"));
    dirs.push(dir);
    const clip = path.join(dir, "clip.m4v");
    const poster = path.join(dir, "poster.jpg");
    const preview = path.join(dir, "preview.jpg");
    const blankPoster = path.join(dir, "blank-poster.jpg");
    const blankPreview = path.join(dir, "blank-preview.jpg");
    await ffmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=1:size=320x240:rate=8",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      clip,
    ]);
    await writePosterAndPreview(path.join(dir, "missing.mp4"), blankPoster, blankPreview, true);
    const blank = await readFile(blankPreview);
    expect(isPlaceholderPreview(blank)).toBe(true);

    await ensureBlurredPreview(clip, poster, preview);
    const frame = await readFile(preview);
    const still = await readFile(poster);
    expect(frame[0]).toBe(0xff);
    expect(frame[1]).toBe(0xd8);
    expect(still[0]).toBe(0xff);
    expect(isPlaceholderPreview(frame)).toBe(false);
    expect(isPlaceholderPreview(still)).toBe(false);
    expect(frame.length).toBeGreaterThan(blank.length);

    const before = await stat(preview);
    await ensureBlurredPreview(clip, poster, preview);
    const after = await stat(preview);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(after.size).toBe(before.size);

    await writeFile(preview, blank);
    await ensureBlurredPreview(clip, poster, preview);
    const healed = await readFile(preview);
    expect(isPlaceholderPreview(healed)).toBe(false);
    expect(healed.length).toBeGreaterThan(blank.length);
  });
});
