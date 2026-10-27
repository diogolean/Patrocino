export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { spawn } = await import("node:child_process");
  const { existsSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const candidates = [
    resolve(process.cwd(), "../../scripts/download-geoip.mjs"),
    resolve(process.cwd(), "scripts/download-geoip.mjs"),
    "/app/scripts/download-geoip.mjs",
  ];
  const script = candidates.find((path) => existsSync(path));
  if (!script) return;
  const child = spawn(process.execPath, [script], { stdio: "ignore", env: process.env });
  child.unref();
}
