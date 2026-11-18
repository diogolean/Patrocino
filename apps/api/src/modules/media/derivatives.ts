import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const tinyJpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxISEhIQEhIVFhUVFRUVFRUVFRUVFRUWFxUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGhAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAQAAwAMBIgACEQEDEQH/xAAbAAACAgMBAAAAAAAAAAAAAAADBAECBgcBA//EABUBAQEAAAAAAAAAAAAAAAAAAAAB/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==",
  "base64",
);

const attempted = new Set<string>();

/** Still-image preview blur. Override with PREVIEW_BLUR_SIGMA. */
export const DEFAULT_PREVIEW_BLUR_SIGMA = 6;
/** Video poster and teaser-clip blur. Override with PREVIEW_BLUR_SIGMA_VIDEO. */
export const DEFAULT_PREVIEW_BLUR_SIGMA_VIDEO = 4;

function readSigma(raw: string | undefined, fallback: number) {
  if (raw == null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(40, Math.max(1, Math.round(parsed)));
}

export function previewBlurSigma(raw = process.env.PREVIEW_BLUR_SIGMA) {
  return readSigma(raw, DEFAULT_PREVIEW_BLUR_SIGMA);
}

export function previewBlurSigmaVideo(raw = process.env.PREVIEW_BLUR_SIGMA_VIDEO) {
  return readSigma(raw, DEFAULT_PREVIEW_BLUR_SIGMA_VIDEO);
}

/** Blur plus about 15% darkening. The darkening is baked into the file, not CSS. */
export function previewBlurFilter(sigma = previewBlurSigma()) {
  return `gblur=sigma=${sigma},eq=brightness=-0.15,scale=720:-2`;
}

/** Start a 3s teaser about a quarter of the way in, staying inside the 20–30% window when the file is long enough. */
export function clipStartSeconds(durationSeconds: number | null | undefined) {
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 3.2) return 0;
  const quarter = durationSeconds * 0.25;
  const latest = durationSeconds - 3;
  return Math.max(0, Math.min(quarter, latest, durationSeconds * 0.3));
}

/** ffmpeg argv for a muted, blurred, darkened H.264 teaser. Does not rewrite the source. */
export function previewClipArgs(input: { inputPath: string; outputPath: string; startSeconds: number; sigma?: number }) {
  const sigma = input.sigma ?? previewBlurSigmaVideo();
  const start = Number.isFinite(input.startSeconds) && input.startSeconds > 0 ? input.startSeconds.toFixed(3) : "0";
  return [
    "-y",
    "-ss",
    start,
    "-i",
    input.inputPath,
    "-t",
    "3",
    "-an",
    "-vf",
    `scale='trunc(min(480,iw)/2)*2':-2,gblur=sigma=${sigma},eq=brightness=-0.15`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "30",
    "-movflags",
    "+faststart",
    "-pix_fmt",
    "yuv420p",
    input.outputPath,
  ];
}

function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("ffmpeg timed out"));
    }, 60_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}`));
    });
  });
}

export function isPlaceholderPreview(bytes: Buffer) {
  return bytes.length === tinyJpeg.length && bytes.subarray(0, 8).equals(tinyJpeg.subarray(0, 8));
}

export async function isRealClipFile(file: string) {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size < 1000) return false;
    const bytes = await readFile(file);
    return bytes.subarray(4, 8).toString("ascii") === "ftyp";
  } catch {
    return false;
  }
}

export async function mediaDurationSeconds(file: string) {
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { stdio: ["ignore", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("ffprobe timed out"));
    }, 20_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(chunks).toString("utf8"));
      else reject(new Error(`ffprobe exited ${code}`));
    });
  }).catch(() => "");
  const seconds = Number(output.trim());
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export async function writePreviewClip(source: string, output: string, durationSeconds: number | null) {
  await mkdir(path.dirname(output), { recursive: true });
  await run(previewClipArgs({ inputPath: source, outputPath: output, startSeconds: clipStartSeconds(durationSeconds) }));
}

export async function isRealPreviewFile(file: string) {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size <= tinyJpeg.length) return false;
    const bytes = await readFile(file);
    return bytes[0] === 0xff && bytes[1] === 0xd8 && !isPlaceholderPreview(bytes);
  } catch {
    return false;
  }
}

async function writeFrame(input: string, output: string, filter: string, seek: string) {
  await run(["-y", "-ss", seek, "-i", input, "-frames:v", "1", "-vf", filter, "-an", output]);
}

export async function writePosterAndPreview(input: string, poster: string, preview: string, video: boolean) {
  await mkdir(path.dirname(poster), { recursive: true });
  await mkdir(path.dirname(preview), { recursive: true });
  const seeks = video ? ["0.5", "0"] : ["0"];
  let posterReady = false;
  for (const seek of seeks) {
    try {
      await writeFrame(input, poster, "scale=720:-2", seek);
      posterReady = true;
      break;
    } catch {
      posterReady = false;
    }
  }
  let previewReady = false;
  if (posterReady) {
    try {
      await run(["-y", "-i", poster, "-frames:v", "1", "-vf", previewBlurFilter(video ? previewBlurSigmaVideo() : previewBlurSigma()), preview]);
      previewReady = true;
    } catch {
      previewReady = false;
    }
  }
  if (!posterReady) await writeFile(poster, tinyJpeg);
  if (!previewReady) await writeFile(preview, tinyJpeg);
}

/** Builds a poster and a blurred frame when either file is missing or still the blank placeholder. */
export async function ensureBlurredPreview(videoPath: string, posterPath: string, previewPath: string) {
  if ((await isRealPreviewFile(previewPath)) && (await isRealPreviewFile(posterPath))) return;
  if (attempted.has(previewPath)) return;
  attempted.add(previewPath);
  await writePosterAndPreview(videoPath, posterPath, previewPath, true);
  if ((await isRealPreviewFile(previewPath)) && (await isRealPreviewFile(posterPath))) attempted.delete(previewPath);
}
