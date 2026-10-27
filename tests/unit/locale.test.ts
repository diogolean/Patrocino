import { describe, expect, it } from "vitest";
import { resolveRequestLocale } from "../../apps/web/i18n/locale";

describe("locale resolution", () => {
  it("prefers the cookie, then the browser language, then the country", () => {
    expect(
      resolveRequestLocale({
        cookie: "en",
        acceptLanguage: "pt-BR,pt;q=0.9",
        cfIpCountry: "MX",
      }),
    ).toBe("en");
    expect(
      resolveRequestLocale({
        cookie: "nope",
        acceptLanguage: "es-MX,es;q=0.9,en;q=0.4",
        cfIpCountry: "BR",
      }),
    ).toBe("pt-BR");
    expect(resolveRequestLocale({ acceptLanguage: "de-DE,de;q=0.8,en;q=0.2" })).toBe("de");
    expect(resolveRequestLocale({ acceptLanguage: "es-MX", cfIpCountry: "US" })).toBe("en");
    expect(resolveRequestLocale({ cfIpCountry: "BR" })).toBe("pt-BR");
    expect(resolveRequestLocale({ cfIpCountry: "PT" })).toBe("pt-BR");
    expect(resolveRequestLocale({ xCountry: "AR" })).toBe("es");
    expect(resolveRequestLocale({ cfIpCountry: "DE" })).toBe("de");
    expect(resolveRequestLocale({ cfIpCountry: "AT" })).toBe("de");
    expect(resolveRequestLocale({ xCountry: "CH" })).toBe("de");
    expect(resolveRequestLocale({ cfIpCountry: "FR" })).toBe("fr");
    expect(resolveRequestLocale({ xCountry: "BE" })).toBe("fr");
    expect(resolveRequestLocale({ cfIpCountry: "US" })).toBe("en");
    expect(resolveRequestLocale({})).toBe("pt-BR");
  });

  it("ignores an unknown country header and uses the geo lookup", () => {
    expect(
      resolveRequestLocale({
        cfIpCountry: "XX",
        xCountry: "T1",
        ip: "177.0.0.1",
        lookupCountry: () => "CL",
      }),
    ).toBe("es");
    expect(
      resolveRequestLocale({
        cfIpCountry: "XX",
        ip: "8.8.8.8",
        lookupCountry: () => null,
      }),
    ).toBe("pt-BR");
  });

});
