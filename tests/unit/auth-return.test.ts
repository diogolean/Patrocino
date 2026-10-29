import { describe, expect, it } from "vitest";
import { authHref, postSignUpPath, verificationLanding } from "../../apps/web/lib/auth-return";

describe("checkout auth return", () => {
  it("links sign-in back to the exact checkout query", () => {
    expect(authHref("sign-in", "/checkout?kind=subscription&id=francesca&plan=monthly&return=/creator/francesca")).toBe(
      "/auth?route=sign-in&next=%2Fcheckout%3Fkind%3Dsubscription%26id%3Dfrancesca%26plan%3Dmonthly%26return%3D%2Fcreator%2Ffrancesca",
    );
  });

  it("drops an open redirect before building the login link", () => {
    expect(authHref("sign-in", "https://evil.example/phish")).toBe("/auth?route=sign-in");
    expect(authHref("sign-up", "//evil.example")).toBe("/auth?route=sign-up");
  });

  it("carries the return path through sign-up and email verification", () => {
    const checkout = "/checkout?kind=post&id=clip-1";
    expect(postSignUpPath(checkout)).toBe(`/verificacao?next=${encodeURIComponent(checkout)}`);
    expect(postSignUpPath("https://evil.example")).toBe("/verificacao");
    expect(verificationLanding(true, checkout)).toBe(checkout);
    expect(verificationLanding(false, checkout)).toBe(
      `/auth?route=sign-in&verified=0&next=${encodeURIComponent(checkout)}`,
    );
    expect(verificationLanding(true, "https://evil.example")).toBe("/auth?route=sign-in&verified=1");
    expect(verificationLanding(false, null)).toBe("/auth?route=sign-in&verified=0");
  });
});
