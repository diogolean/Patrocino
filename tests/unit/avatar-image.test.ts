import { describe, expect, it } from "vitest";
import { access } from "node:fs/promises";
import { avatarMaxBytes, readAvatarImage, renderAvatarJpeg } from "../../apps/api/src/modules/auth/avatar";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function jpeg() {
  return Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
}

function webp() {
  return Buffer.concat([Buffer.from("RIFF"), Buffer.from([16, 0, 0, 0]), Buffer.from("WEBP"), Buffer.alloc(8)]);
}

function gif() {
  return Buffer.from("GIF89a", "ascii");
}

function mp4() {
  const buffer = Buffer.alloc(24, 0);
  buffer.write("ftyp", 4, "ascii");
  buffer.write("isom", 8, "ascii");
  return buffer;
}

describe("avatar image validation", () => {
  it("accepts jpeg, png, and webp and rejects other bytes", () => {
    expect(readAvatarImage(jpeg()).detected?.mimeType).toBe("image/jpeg");
    expect(readAvatarImage(png).detected?.mimeType).toBe("image/png");
    expect(readAvatarImage(webp()).detected?.mimeType).toBe("image/webp");
    expect(readAvatarImage(gif()).error).toBe("AVATAR_INVALID");
    expect(readAvatarImage(mp4()).error).toBe("AVATAR_INVALID");
    expect(readAvatarImage(Buffer.alloc(0)).error).toBe("AVATAR_INVALID");
    const huge = Buffer.alloc(avatarMaxBytes + 1);
    huge[0] = 0xff;
    huge[1] = 0xd8;
    huge[2] = 0xff;
    expect(readAvatarImage(huge).error).toBe("AVATAR_TOO_LARGE");
  });

  it("center-crops an accepted image to a jpeg", async () => {
    try {
      await access("/usr/bin/ffmpeg");
    } catch {
      return;
    }
    const jpeg = await renderAvatarJpeg(png);
    expect(jpeg[0]).toBe(0xff);
    expect(jpeg[1]).toBe(0xd8);
    expect(jpeg.length).toBeGreaterThan(100);
  });
});
