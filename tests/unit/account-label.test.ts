import { describe, expect, it } from "vitest";
import { accountDisplayName, accountInitial } from "../../apps/web/lib/account-label";

describe("account display name", () => {
  it("prefers the profile name, then the username, then the email local part", () => {
    expect(accountDisplayName({ name: "Luna Ferraz", username: "lunaferraz", email: "luna@patrocino.com" })).toBe("Luna Ferraz");
    expect(accountDisplayName({ name: "  ", username: "lunaferraz", email: "luna@patrocino.com" })).toBe("lunaferraz");
    expect(accountDisplayName({ name: "", username: "", email: "fan@mimelux.com.br" })).toBe("fan");
    expect(accountInitial("Ezequiel")).toBe("E");
    expect(accountInitial("")).toBe("?");
  });
});