import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

const { compare } = createRequire(fileURLToPath(new URL("../../packages/db/package.json", import.meta.url)))("bcryptjs") as {
  compare: (value: string, hash: string) => Promise<boolean>;
};
import { database } from "../../packages/db/src/index";
import { seedEzequiel } from "../../packages/db/prisma/seed";

const placeholderEmail = "ezequiel.afiliado@patrocino.com";

async function removeEzequiel() {
  const affiliate = await database.affiliate.findUnique({ where: { code: "ezequiel" } });
  if (affiliate) await database.affiliate.delete({ where: { id: affiliate.id } });
  await database.user.deleteMany({ where: { email: placeholderEmail } });
}

describe("Ezequiel affiliate seed", () => {
  const previous = process.env.PATROCINO_CREATORS_PASSWORD;

  afterAll(async () => {
    if (previous === undefined) delete process.env.PATROCINO_CREATORS_PASSWORD;
    else process.env.PATROCINO_CREATORS_PASSWORD = previous;
    await removeEzequiel();
    await database.$disconnect();
  });

  it("skips the account when the creator password is unset and hashes it when set", async () => {
    await removeEzequiel();
    delete process.env.PATROCINO_CREATORS_PASSWORD;
    await seedEzequiel();
    expect(await database.user.findUnique({ where: { email: placeholderEmail } })).toBeNull();
    expect(await database.affiliate.findUnique({ where: { code: "ezequiel" } })).toBeNull();

    const password = randomBytes(18).toString("base64url");
    process.env.PATROCINO_CREATORS_PASSWORD = password;
    await seedEzequiel();
    const created = await database.user.findUnique({
      where: { email: placeholderEmail },
      include: { affiliate: true },
    });
    expect(created?.affiliate?.emailPlaceholder).toBe(true);
    expect(created?.affiliate?.commissionBps).toBe(2000);
    expect(await compare(password, created!.passwordHash)).toBe(true);
    expect(created!.passwordHash).not.toContain(password);

    const firstHash = created!.passwordHash;
    process.env.PATROCINO_CREATORS_PASSWORD = randomBytes(18).toString("base64url");
    await seedEzequiel();
    const again = await database.user.findUnique({ where: { email: placeholderEmail } });
    expect(again?.passwordHash).toBe(firstHash);
    expect(again?.email).toBe(placeholderEmail);
  });
});