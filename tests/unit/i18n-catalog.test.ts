import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { legalDocument } from "../../apps/web/lib/legal-documents";

function flatten(value: unknown, prefix = "", out = new Set<string>()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    out.add(prefix);
    return out;
  }
  for (const [key, child] of Object.entries(value)) {
    flatten(child, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

describe("message catalogs", () => {
  it("gives every locale the same keys as pt-BR", () => {
    const files = readdirSync("apps/web/messages").filter((file) => file.endsWith(".json"));
    const catalogs = new Map(files.map((file) => [file.replace(/\.json$/, ""), flatten(JSON.parse(readFileSync(`apps/web/messages/${file}`, "utf8")))]));
    const source = catalogs.get("pt-BR");
    expect(source?.size).toBeGreaterThan(0);
    for (const [locale, keys] of catalogs) {
      expect([...source!].filter((key) => !keys.has(key)), locale).toEqual([]);
      expect([...keys].filter((key) => !source!.has(key)), locale).toEqual([]);
    }
  });

  it("serves a legal page in each supported language", () => {
    expect(legalDocument("pt-BR", "privacy").title).toMatch(/Privacidade/);
    expect(legalDocument("en", "privacy").title).toMatch(/Privacy/);
    expect(legalDocument("es", "privacy").title).toMatch(/privacidad/i);
    expect(legalDocument("de", "privacy").title).toMatch(/Datenschutz/);
    expect(legalDocument("fr", "privacy").title).toMatch(/confidentialité/i);
  });
});
