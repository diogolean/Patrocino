import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const locales = ["en", "es", "de", "fr"];
const targets = { en: "en", es: "es", de: "de", fr: "fr" };

function flatten(value, prefix = "", out = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) flatten(child, path, out);
    else out.set(path, String(child));
  }
  return out;
}

function setPath(tree, path, value) {
  const parts = path.split(".");
  let cursor = tree;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== "object") cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
}

function protect(text) {
  const tokens = [];
  const masked = text.replace(/(\{[^{}]+\}|<\/?[A-Za-z0-9]+>)/g, (token) => {
    const marker = `PH${tokens.length}X`;
    tokens.push(token);
    return marker;
  });
  return { masked, tokens };
}

function restore(text, tokens) {
  return text.replace(/PH(\d+)X/g, (_, index) => tokens[Number(index)] ?? "");
}

async function translate(text, target) {
  const provider = process.env.I18N_MT_PROVIDER?.trim();
  if (!provider) {
    throw new Error("Set I18N_MT_PROVIDER to a translator such as libretranslate. The script does not call a service by itself.");
  }
  const { masked, tokens } = protect(text);
  if (provider === "copy") return text;
  if (provider !== "libretranslate") {
    throw new Error(`Unknown I18N_MT_PROVIDER "${provider}". Use libretranslate or copy.`);
  }
  const endpoint = process.env.I18N_MT_URL?.trim();
  if (!endpoint) throw new Error("Set I18N_MT_URL to the LibreTranslate endpoint.");
  const body = { q: masked, source: "pt", target, format: "text" };
  const apiKey = process.env.I18N_MT_API_KEY?.trim();
  if (apiKey) body.api_key = apiKey;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`translator failed (${response.status})`);
  const payload = await response.json();
  const translated = typeof payload.translatedText === "string" ? payload.translatedText : "";
  if (!translated) throw new Error("translator returned an empty string");
  return restore(translated, tokens);
}

const source = JSON.parse(readFileSync(resolve(root, "apps/web/messages/pt-BR.json"), "utf8"));
const sourceKeys = flatten(source);
let missing = 0;
for (const locale of locales) {
  const file = resolve(root, `apps/web/messages/${locale}.json`);
  const catalog = JSON.parse(readFileSync(file, "utf8"));
  const have = flatten(catalog);
  let added = 0;
  for (const [key, value] of sourceKeys) {
    if (have.has(key)) continue;
    missing += 1;
    added += 1;
    setPath(catalog, key, await translate(value, targets[locale]));
    console.log(`${locale} ${key}`);
  }
  if (added > 0) writeFileSync(file, `${JSON.stringify(catalog, null, 2)}\n`);
}
if (missing === 0) console.log("message catalogs already match pt-BR");
