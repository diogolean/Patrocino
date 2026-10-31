import { describe, expect, it } from "vitest";
import { exclusiveVideoIndex, exclusiveVideoLabel, redactVideoTitle } from "./exclusive-video";

describe("exclusive video labels", () => {
  it("numbers videos from a stable order and never repeats the stored title", () => {
    const ids = ["older", "newer"];
    expect(exclusiveVideoIndex(ids, "older")).toBe(1);
    expect(exclusiveVideoIndex(ids, "newer")).toBe(2);
    expect(exclusiveVideoLabel(2, "pt-BR")).toBe("Vídeo exclusivo #2");
    expect(exclusiveVideoLabel(2, "en")).toBe("Exclusive video #2");
    expect(exclusiveVideoLabel(2, "es")).toBe("Vídeo exclusivo #2");
    expect(exclusiveVideoLabel(2, "de")).toBe("Exklusives Video #2");
    expect(exclusiveVideoLabel(2, "fr")).toBe("Vidéo exclusive #2");
    expect(exclusiveVideoLabel(2, "en-US")).toBe("Exclusive video #2");
    const body = redactVideoTitle("Olha clip.mp4 agora", "clip.mp4", exclusiveVideoLabel(1, "pt-BR"));
    expect(body).toBe("Olha Vídeo exclusivo #1 agora");
    expect(body).not.toContain("clip.mp4");
  });
});
