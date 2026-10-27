import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const tinyJpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxISEhIQEhIVFhUVFRUVFRUVFRUVFRUWFxUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGhAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAQAAwAMBIgACEQEDEQH/xAAbAAACAgMBAAAAAAAAAAAAAAADBAECBgcBA//EABUBAQEAAAAAAAAAAAAAAAAAAAAB/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==",
  "base64",
);

const attempted = new Set<string>();

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

async function isRealPreview(file: string) {
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
      await run(["-y", "-i", poster, "-frames:v", "1", "-vf", "gblur=sigma=18,scale=720:-2", preview]);
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
  if ((await isRealPreview(previewPath)) && (await isRealPreview(posterPath))) return;
  if (attempted.has(previewPath)) return;
  attempted.add(previewPath);
  await writePosterAndPreview(videoPath, posterPath, previewPath, true);
  if ((await isRealPreview(previewPath)) && (await isRealPreview(posterPath))) attempted.delete(previewPath);
}
