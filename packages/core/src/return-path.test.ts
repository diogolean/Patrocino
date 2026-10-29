import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./return-path";

describe("safeReturnPath", () => {
  it("keeps a checkout path and its query", () => {
    expect(safeReturnPath("/checkout?kind=subscription&id=francesca&plan=monthly")).toBe(
      "/checkout?kind=subscription&id=francesca&plan=monthly",
    );
    expect(safeReturnPath("/checkout")).toBe("/checkout");
    expect(safeReturnPath("/creator/francesca#plans")).toBe("/creator/francesca#plans");
  });

  it("rejects absolute and protocol-relative targets", () => {
    expect(safeReturnPath("https://evil.example/checkout")).toBeNull();
    expect(safeReturnPath("http://evil.example")).toBeNull();
    expect(safeReturnPath("//evil.example")).toBeNull();
    expect(safeReturnPath("///evil.example")).toBeNull();
    expect(safeReturnPath("/\\evil.example")).toBeNull();
    expect(safeReturnPath("javascript:alert(1)")).toBeNull();
    expect(safeReturnPath(" /checkout")).toBe("/checkout");
    expect(safeReturnPath("")).toBeNull();
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath("/checkout\nSet-Cookie: x")).toBeNull();
    expect(safeReturnPath("/checkout?next=https://evil.example")).toBe("/checkout?next=https://evil.example");
  });
});
