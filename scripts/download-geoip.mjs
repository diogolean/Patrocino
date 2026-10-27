import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(new URL("..", import.meta.url).pathname);
const destination = process.env.GEOIP_DB_PATH
  ? resolve(process.env.GEOIP_DB_PATH)
  : resolve(root, "data/geoip/country.mmdb");
const sourcePath = destination.replace(/\.mmdb$/, ".source");
const maxAgeMs = 30 * 24 * 60 * 60 * 1000;

function fresh() {
  if (!existsSync(destination)) return false;
  return Date.now() - statSync(destination).mtimeMs < maxAgeMs;
}

function monthStamp(date) {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

async function download(url, file) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`download failed (${response.status})`);
  mkdirSync(dirname(file), { recursive: true });
  await pipeline(response.body, createWriteStream(file));
}

function findMmdb(directory) {
  for (const name of readdirSync(directory)) {
    const full = resolve(directory, name);
    if (statSync(full).isDirectory()) {
      const nested = findMmdb(full);
      if (nested) return nested;
    } else if (name.endsWith(".mmdb")) return full;
  }
  return null;
}

async function saveDbIp() {
  const now = new Date();
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  let lastError = null;
  for (const stamp of [monthStamp(now), monthStamp(previous)]) {
    const gzipPath = `${destination}.gz`;
    try {
      await download(`https://download.db-ip.com/free/dbip-country-lite-${stamp}.mmdb.gz`, gzipPath);
      await pipeline(createReadStream(gzipPath), createGunzip(), createWriteStream(destination));
      writeFileSync(sourcePath, "db-ip\nIP to Country Lite, CC BY 4.0, https://db-ip.com/\n");
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("DB-IP download failed");
}

async function saveMaxMind(licenseKey) {
  const archive = resolve(tmpdir(), `geolite2-country-${process.pid}.tar.gz`);
  const extractDir = resolve(tmpdir(), `geolite2-country-${process.pid}`);
  const url = `https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-Country&license_key=${encodeURIComponent(licenseKey)}&suffix=tar.gz`;
  await download(url, archive);
  mkdirSync(extractDir, { recursive: true });
  await execFileAsync("tar", ["-xzf", archive, "-C", extractDir]);
  const found = findMmdb(extractDir);
  if (!found) throw new Error("GeoLite2 archive did not contain an mmdb");
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(found));
  writeFileSync(sourcePath, "maxmind\nGeoLite2 Country\n");
}

if (!fresh()) {
  const licenseKey = process.env.MAXMIND_LICENSE_KEY?.trim();
  try {
    if (licenseKey) await saveMaxMind(licenseKey);
    else await saveDbIp();
  } catch (error) {
    if (existsSync(destination)) {
      console.warn("[geoip] refresh failed; keeping the cached database");
    } else {
      console.warn(`[geoip] country database unavailable (${error instanceof Error ? error.message : "download failed"})`);
      process.exit(1);
    }
  }
}
