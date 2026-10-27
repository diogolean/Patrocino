import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { database } from "@mimelux/db/runtime";
import { writePosterAndPreview } from "./modules/media/derivatives";
import { resolveVideoPrice } from "./modules/media/entitlement";
import { detectFile } from "./modules/media/sniff";
import { openStorage } from "./modules/media/storage";

const extensions = new Set([".mp4", ".m4v", ".mov", ".webm", ".jpg", ".jpeg", ".png", ".gif", ".webp"]);

export type ImportOptions = {
  creator: string;
  dir: string;
  access: "subscriber_ppv" | "subscribers" | "free" | "ppv";
  priceCents?: number;
};

function visibilityOf(access: ImportOptions["access"]) {
  if (access === "subscriber_ppv") return "SUBSCRIBER_PPV" as const;
  if (access === "ppv") return "PPV" as const;
  if (access === "free") return "FREE" as const;
  return "SUBSCRIBERS" as const;
}

async function sha256(file: string) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

async function filesIn(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await filesIn(absolute)));
    else if (extensions.has(path.extname(entry.name).toLowerCase())) files.push(absolute);
  }
  return files.sort();
}

export async function importCreatorMedia(options: ImportOptions) {
  const keys = Array.from(new Set([options.creator, options.creator.replace(/-/g, "")]));
  const creator = await database.creator.findFirst({
    where: {
      OR: [{ id: { in: keys } }, { user: { profile: { is: { username: { in: keys } } } } }],
    },
  });
  if (!creator) throw new Error(`Creator not found: ${options.creator}`);
  const visibility = visibilityOf(options.access);
  const priceCents = resolveVideoPrice({
    visibility,
    explicitCents: options.priceCents,
    defaultVideoPriceCents: creator.defaultVideoPriceCents,
  });
  if ((visibility === "PPV" || visibility === "SUBSCRIBER_PPV") && !priceCents) {
    throw new Error("A price is required for this access level.");
  }
  const storage = await openStorage();
  const paths = await filesIn(options.dir);
  let created = 0;
  let skipped = 0;
  for (const file of paths) {
    const contentHash = await sha256(file);
    const existing = await database.post.findFirst({
      where: { creatorId: creator.id, contentHash },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }
    const info = await stat(file);
    const handle = await open(file, "r");
    const sample = Buffer.alloc(64);
    await handle.read(sample, 0, 64, 0);
    await handle.close();
    const detected = detectFile(sample);
    if (!detected) {
      skipped += 1;
      continue;
    }
    const locked = visibility !== "FREE";
    const post = await database.post.create({
      data: {
        creatorId: creator.id,
        caption: path.basename(file),
        visibility,
        priceCents,
        publishedAt: new Date(),
        contentHash,
        sortOrder: created + skipped,
      },
    });
    const media = await database.media.create({
      data: {
        postId: post.id,
        kind: detected.kind,
        storageKey: "pending",
        mimeType: detected.mimeType,
        byteSize: info.size,
        private: locked,
      },
    });
    const folder = locked ? "private" : "public";
    const storageKey = `uploads/${creator.id}/${folder}/${media.id}.${detected.extension}`;
    const posterKey =
      visibility === "SUBSCRIBER_PPV"
        ? `uploads/${creator.id}/private/posters/${media.id}.jpg`
        : `uploads/${creator.id}/posters/${media.id}.jpg`;
    const previewKey = `uploads/${creator.id}/previews/${media.id}.jpg`;
    const destination = storage.resolve(storageKey);
    await mkdir(path.dirname(destination), { recursive: true });
    await pipeline(createReadStream(file), createWriteStream(destination));
    await writePosterAndPreview(storage.resolve(storageKey), storage.resolve(posterKey), storage.resolve(previewKey), detected.kind === "VIDEO");
    await database.media.update({
      where: { id: media.id },
      data: { storageKey, posterKey, previewKey, private: locked },
    });
    created += 1;
  }
  return { created, skipped };
}

function readArgs(argv: string[]) {
  const values: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      values[key] = next;
      index += 1;
    } else {
      values[key] = "true";
    }
  }
  return values;
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const access = args.access;
  if (!args.creator || !args.dir || (access !== "subscriber_ppv" && access !== "subscribers" && access !== "free" && access !== "ppv")) {
    throw new Error("Usage: media:import --creator <slug> --dir <path> --access subscriber_ppv [--price-cents N]");
  }
  const price = args["price-cents"] ? Number(args["price-cents"]) : undefined;
  if (price !== undefined && (!Number.isInteger(price) || price <= 0)) throw new Error("--price-cents must be a positive integer");
  const result = await importCreatorMedia({
    creator: args.creator,
    dir: args.dir,
    access,
    priceCents: price,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]?.includes("media-import")) {
  main()
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : "Import failed"}\n`);
      process.exitCode = 1;
    })
    .finally(() => database.$disconnect());
}
