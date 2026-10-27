import { describe, expect, it } from "vitest";
import { readMediaGrant, signMediaGrant } from "../../apps/api/src/modules/media/signed-url";

const key = "grant-test-secret";

describe("short-lived media grants", () => {
  it("accepts a signed file grant and rejects expiry, tampering, and the wrong media", () => {
    const now = Date.parse("2026-10-27T12:00:00.000Z");
    const token = signMediaGrant(
      { mediaId: "media-1", userId: "fan-1", exp: Math.floor(now / 1000) + 60, kind: "file" },
      key,
    );
    expect(readMediaGrant(token, now, key)).toEqual({
      mediaId: "media-1",
      userId: "fan-1",
      exp: Math.floor(now / 1000) + 60,
      kind: "file",
    });
    expect(readMediaGrant(token, now + 61_000, key)).toBeNull();
    expect(readMediaGrant(token, now, "other-secret")).toBeNull();
    const [payload, signature] = token.split(".");
    expect(readMediaGrant(`${payload}.${signature}x`, now, key)).toBeNull();
    expect(readMediaGrant(token.slice(1), now, key)).toBeNull();

    const other = signMediaGrant(
      { mediaId: "media-2", userId: "fan-1", exp: Math.floor(now / 1000) + 60, kind: "file" },
      key,
    );
    expect(readMediaGrant(other, now, key)?.mediaId).toBe("media-2");
  });
});
