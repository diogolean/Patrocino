import { describe, expect, it } from "vitest";
import { LINK_CODE_PATTERN, affiliateLinkPath, opaqueLinkCode } from "../../packages/core/src/currency";

describe("opaque affiliate links", () => {
  it("builds /<creator>/<code> without the affiliate name", () => {
    expect(affiliateLinkPath("sarah-mitchell", "k7x2m9")).toBe("/sarah-mitchell/k7x2m9");
  });

  it("generates random codes that match the public pattern", () => {
    const codes = new Set(Array.from({ length: 200 }, () => opaqueLinkCode()));
    expect(codes.size).toBeGreaterThan(195);
    for (const code of codes) expect(code).toMatch(LINK_CODE_PATTERN);
    expect(opaqueLinkCode(6, () => new Uint8Array(6))).toBe("aaaaaa");
  });
});
