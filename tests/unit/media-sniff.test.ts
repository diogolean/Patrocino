import { describe, expect, it } from "vitest";
import { declaredMimeMatches, detectFile, servedMimeType } from "../../apps/api/src/modules/media/sniff";

function ftyp(brand: string) {
  const buffer = Buffer.alloc(32, 0);
  buffer.write("ftyp", 4, "ascii");
  buffer.write(brand, 8, "ascii");
  return buffer;
}

describe("video sniffing", () => {
  it("serves .m4v and isom MP4 as video/mp4 and ignores m4a audio", () => {
    expect(detectFile(ftyp("M4V "))).toEqual({ kind: "VIDEO", mimeType: "video/mp4", extension: "mp4" });
    expect(detectFile(ftyp("isom"))).toEqual({ kind: "VIDEO", mimeType: "video/mp4", extension: "mp4" });
    expect(detectFile(ftyp("M4A "))).toBeNull();
    expect(detectFile(ftyp("qt  "))?.mimeType).toBe("video/quicktime");

    const video = detectFile(ftyp("M4V "));
    expect(video && declaredMimeMatches("video/x-m4v", video)).toBe(true);
    expect(video && declaredMimeMatches("video/mp4", video)).toBe(true);
    expect(servedMimeType("video/x-m4v")).toBe("video/mp4");
    expect(servedMimeType("video/m4v")).toBe("video/mp4");
    expect(servedMimeType("video/webm")).toBe("video/webm");
  });
});
