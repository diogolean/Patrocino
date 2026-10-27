import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Reader, type CountryResponse } from "maxmind";

type CountryRow = CountryResponse & { country_code?: string };

let reader: Reader<CountryRow> | null | undefined;

function databasePath() {
  const candidates = [
    process.env.GEOIP_DB_PATH,
    "/app/data/geoip/country.mmdb",
    resolve(process.cwd(), "data/geoip/country.mmdb"),
    resolve(process.cwd(), "../../data/geoip/country.mmdb"),
  ];
  return candidates.find((path) => path && existsSync(path)) ?? null;
}

function openDatabase() {
  if (reader !== undefined) return reader;
  const path = databasePath();
  if (!path) {
    reader = null;
    return reader;
  }
  try {
    reader = new Reader<CountryRow>(readFileSync(path));
  } catch {
    reader = null;
  }
  return reader;
}

export function countryFromIp(ip: string | null): string | null {
  if (!ip) return null;
  const lookup = openDatabase();
  if (!lookup) return null;
  try {
    const row = lookup.get(ip);
    const code = row?.country?.iso_code || row?.registered_country?.iso_code || row?.country_code || "";
    const normalized = code.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

export function resetGeoIpCache() {
  reader = undefined;
}
