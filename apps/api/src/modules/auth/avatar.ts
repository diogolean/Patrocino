import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { detectFile } from "../media/sniff";

export const avatarMaxBytes = 8 * 1024 * 1024;

export class AvatarTooLargeError extends Error {
  constructor() {
    super("AVATAR_TOO_LARGE");
    this.name = "AvatarTooLargeError";
  }
}

const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);

export function readAvatarImage(buffer: Buffer) {
  if (buffer.length === 0) return { error: "AVATAR_INVALID" as const };
  if (buffer.length > avatarMaxBytes) return { error: "AVATAR_TOO_LARGE" as const };
  const detected = detectFile(buffer);
  if (!detected || detected.kind !== "IMAGE" || !allowed.has(detected.mimeType)) {
    return { error: "AVATAR_INVALID" as const };
  }
  return { detected };
}

type ByteStream = AsyncIterable<Buffer | Uint8Array | string> & {
  rawBody?: Buffer;
  readableEnded?: boolean;
};

export async function readAvatarBody(request: ByteStream, limit = avatarMaxBytes) {
  if (request.readableEnded) {
    const body = Buffer.isBuffer(request.rawBody) ? request.rawBody : Buffer.alloc(0);
    if (body.length > limit) throw new AvatarTooLargeError();
    return body;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new AvatarTooLargeError();
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("ffmpeg timed out"));
    }, 20_000);
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

/** Center-crop to a 512 JPEG the public media route can serve. */
export async function renderAvatarJpeg(input: Buffer) {
  const dir = await mkdtemp(path.join(tmpdir(), "patrocino-avatar-"));
  const source = path.join(dir, "source");
  const output = path.join(dir, "avatar.jpg");
  try {
    await writeFile(source, input);
    await runFfmpeg([
      "-y",
      "-i",
      source,
      "-vf",
      "scale=512:512:force_original_aspect_ratio=increase,crop=512:512",
      "-frames:v",
      "1",
      "-q:v",
      "3",
      output,
    ]);
    const jpeg = await readFile(output);
    if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
      throw new Error("avatar render was not a jpeg");
    }
    return jpeg;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
