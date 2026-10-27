import { PrismaClient, type OwnershipType, type UserRole } from "@prisma/client";
import { hash } from "bcryptjs";
import {
  demoCreatorCreatedAt,
  demoExtraPostsFor,
  demoPostPublishedAt,
  imageFile,
  initialCreators,
  initialPosts,
  launchCreatorCreatedAt,
  launchPostPublishedAt,
  modelMediaPath,
  withAssetVersion,
} from "@mimelux/core";

const prisma = new PrismaClient();
const demoPasswordHash =
  "$2b$10$VrD.M82EvcYYKJrnPC0tsua6uUQMdclUMlGAWTYUxR8KOgwL646.a";

const creators = [
  ["Luna Ferraz", "lunaferraz", "lifestyle", "Lifestyle, café e pôr do sol em SP.", "luna-ferraz", "post-01.jpg"],
  ["Bella Monroe", "bellamonroe", "fashion", "Moda autoral e looks do dia.", "bella-monroe", "post-02.jpg"],
  ["Nina Valença", "ninavalenca", "beauty", "Skincare e maquiagem natural.", "nina-valenca", "post-03.jpg"],
  ["Sofia Blake", "sofiablake", "fitness", "Treinos e bem-estar diário.", "sofia-blake", "post-04.jpg"],
  ["Clara Duarte", "claraduarte", "travel", "Viagens e roteiros secretos.", "clara-duarte", "post-05.jpg"],
  ["Mia Castell", "miacastell", "music", "Música acústica e bastidores.", "mia-castell", "post-06.jpg"],
  ["Aiko Lume", "aikolume", "fashion", "Minimalismo e moda urbana.", "aiko-lume", "post-07.jpg"],
  ["Valentina Rios", "valentinarios", "fitness", "Pilates e alimentação leve.", "valentina-rios", "post-08.jpg"],
  ["Zara Monteiro", "zaramonteiro", "beauty", "Beleza, cabelo e autoestima.", "zara-monteiro", "post-09.jpg"],
  ["Elena Vidal", "elenavidal", "lifestyle", "Rotina slow e decoração.", "elena-vidal", "post-10.jpg"],
  ["Isis Amaral", "isisamaral", "travel", "Praias e aventuras pelo Brasil.", "isis-amaral", "post-11.jpg"],
  ["Grace Halden", "gracehalden", "music", "Voz, piano e noites de jazz.", "grace-halden", "post-12.jpg"],
  ["Lara Nakamura", "laranakamura", "lifestyle", "Gastronomia e dicas de SP.", "lara-nakamura", null],
  ["Maya Torres", "mayatorres", "fitness", "Treino, praia e muita energia.", "maya-torres", null],
  ["Kiara Lopes", "kiaralopes", "fashion", "Moda ousada e looks de verão.", "kiara-lopes", null],
  ["Alana Reis", "alanareis", "travel", "Ilhas, barcos e pôr do sol.", "alana-reis", null],
] as const;

type EnsureUserInput = {
  email: string;
  passwordHash: string;
  role: UserRole;
  isDemo?: boolean;
  createdAt?: Date;
};

async function ensureUser(data: EnsureUserInput) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      email: data.email,
      passwordHash: data.passwordHash,
      role: data.role,
      emailVerifiedAt: new Date(),
      isDemo: data.isDemo ?? false,
      createdAt: data.createdAt,
    },
  });
}

async function ensureProfile(data: {
  userId: string;
  name: string;
  username: string;
  bio?: string | null;
  city?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  isDemo?: boolean;
}) {
  const existing = await prisma.profile.findUnique({ where: { userId: data.userId } });
  if (existing) return existing;
  return prisma.profile.create({ data });
}

async function ensureCreator(data: {
  userId: string;
  status?: "ACTIVE";
  category: string;
  ownership?: OwnershipType;
  aiGenerated?: boolean;
  fictitious?: boolean;
  isDemo?: boolean;
  createdAt?: Date;
}) {
  const existing = await prisma.creator.findUnique({ where: { userId: data.userId } });
  if (existing) return existing;
  return prisma.creator.create({
    data: {
      userId: data.userId,
      status: data.status ?? "ACTIVE",
      category: data.category,
      ownership: data.ownership,
      aiGenerated: data.aiGenerated ?? false,
      fictitious: data.fictitious ?? false,
      isDemo: data.isDemo ?? false,
      createdAt: data.createdAt,
    },
  });
}

async function ensurePlan(data: {
  creatorId: string;
  name: string;
  description: string;
  priceCents: number;
  durationMonths: number;
  discountPercent: number;
  isDemo?: boolean;
}) {
  const existing = await prisma.plan.findFirst({
    where: { creatorId: data.creatorId, durationMonths: data.durationMonths },
  });
  if (existing) return existing;
  return prisma.plan.create({ data });
}

async function ensureAffiliate(data: { userId: string; code: string; displayName: string; isDemo?: boolean }) {
  const existing = await prisma.affiliate.findUnique({ where: { userId: data.userId } });
  if (existing) return existing;
  return prisma.affiliate.create({ data });
}

export async function seedDatabase() {
  for (const [index, [name, username, category, bio, fileSlug, postFile]] of creators.entries()) {
    const createdAt = demoCreatorCreatedAt(index);
    const avatarUrl = withAssetVersion(`/media/generated/creator-${fileSlug}-avatar.jpg`);
    const coverUrl = withAssetVersion(`/media/generated/creator-${fileSlug}-cover.jpg`);
    const email =
      username === "lunaferraz"
        ? "criadora@mimelux.com.br"
        : `${username}@creators.patrocino.com`;
    const user = await ensureUser({
      email,
      passwordHash: demoPasswordHash,
      role: "CREATOR",
      isDemo: true,
      createdAt,
    });
    await ensureProfile({
      userId: user.id,
      name,
      username,
      bio,
      city: "Brasil",
      avatarUrl,
      coverUrl,
      isDemo: true,
    });
    const creator = await ensureCreator({
      userId: user.id,
      status: "ACTIVE",
      category,
      aiGenerated: true,
      fictitious: true,
      isDemo: true,
      createdAt,
    });
    for (const [months, discount] of [[1, 0], [3, 10], [6, 20], [12, 30]] as const) {
      const planName = months === 1 ? "Mensal" : `${months} meses`;
      await ensurePlan({
        creatorId: creator.id,
        name: planName,
        description: "Plano fictício de demonstração.",
        priceCents: 2990 * months,
        durationMonths: months,
        discountPercent: discount,
        isDemo: true,
      });
    }
    if (postFile) {
      const bareKey = `/media/generated/${postFile}`;
      const storageKey = withAssetVersion(bareKey);
      const existing = await prisma.post.findFirst({
        where: { creatorId: creator.id, caption: { contains: "Conteúdo aberto" } },
        include: { media: true },
      });
      if (!existing) {
        await prisma.post.create({
          data: {
            creatorId: creator.id,
            caption: `Conteúdo aberto de ${name} · perfil fictício gerado por IA.`,
            visibility: "FREE",
            likeCount: 1240,
            publishedAt: demoPostPublishedAt(index),
            isDemo: true,
            media: { create: { kind: "IMAGE", storageKey, mimeType: "image/jpeg", isDemo: true } },
          },
        });
      } else {
        for (const item of existing.media) {
          const bare = item.storageKey.split("?")[0];
          if (bare === bareKey && item.storageKey !== storageKey) {
            await prisma.media.update({ where: { id: item.id }, data: { storageKey } });
          }
        }
      }
    }

    const creatorPosts = await prisma.post.findMany({
      where: { creatorId: creator.id },
      orderBy: { createdAt: "asc" },
      include: { media: { select: { storageKey: true } } },
    });
    const legacyPosts = creatorPosts.filter((post) =>
      post.media.every((item) => !(item.storageKey.split("?")[0] ?? "").startsWith("/media/models/demo/")),
    );
    for (const [postIndex, post] of legacyPosts.entries()) {
      await prisma.post.update({
        where: { id: post.id },
        data: { likeCount: 1240 + postIndex * 317, publishedAt: demoPostPublishedAt(index * 20 + postIndex) },
      });
      const comment = await prisma.postComment.findFirst({ where: { postId: post.id, isDemo: true } });
      if (!comment) {
        await prisma.postComment.create({
          data: {
            postId: post.id,
            authorName: "Marina Costa",
            body: "Que luz linda nesse registro.",
            isDemo: true,
          },
        });
      }
    }
    await seedDemoExtraPosts(creator.id, fileSlug);

    const review = await prisma.review.findFirst({ where: { creatorId: creator.id, isDemo: true } });
    if (!review) {
      await prisma.review.createMany({
        data: [
          {
            creatorId: creator.id,
            authorName: "Marina Costa",
            rating: 5,
            body: "Acompanhar de perto vale cada detalhe.",
            subscriber: true,
            isDemo: true,
          },
          {
            creatorId: creator.id,
            authorName: "Pedro Almeida",
            rating: 4,
            body: "A rotina publicada aqui parece feita com cuidado.",
            subscriber: true,
            isDemo: true,
          },
        ],
      });
    }
  }

  const fan = await ensureUser({
    email: "fan@mimelux.com.br",
    passwordHash: demoPasswordHash,
    role: "FAN",
    isDemo: true,
  });
  await ensureProfile({ userId: fan.id, name: "Fã Demo", username: "fandemo", isDemo: true });
  const affiliateUser = await ensureUser({
    email: "afiliado@mimelux.com.br",
    passwordHash: demoPasswordHash,
    role: "AFFILIATE",
    isDemo: true,
  });
  await ensureProfile({ userId: affiliateUser.id, name: "Afiliado Demo", username: "afiliadodemo", isDemo: true });
  await ensureAffiliate({
    userId: affiliateUser.id,
    code: "LUXDEMO",
    displayName: "Afiliado Demo",
    isDemo: true,
  });
  await seedInitialCreators();
  await versionStoredAssetUrls();
  await ensureSeedAdmins();
}

function posterDiskKey(poster: string | undefined) {
  if (!poster) return null;
  const bare = poster.split("?")[0] ?? poster;
  return bare.startsWith("/media/") ? bare.slice("/media/".length) : bare.replace(/^\/+/, "");
}

async function seedDemoExtraPosts(creatorId: string, slug: string) {
  for (const post of demoExtraPostsFor(slug)) {
    const bareKey = post.path.split("?")[0] ?? post.path;
    const existing = await prisma.media.findFirst({
      where: {
        post: { creatorId },
        OR: [{ storageKey: bareKey }, { storageKey: { startsWith: `${bareKey}?` } }],
      },
      select: { id: true, postId: true, storageKey: true },
    });
    const data = {
      caption: post.caption,
      visibility: post.free ? "FREE" as const : "SUBSCRIBERS" as const,
      likeCount: post.likes,
      publishedAt: post.publishedAt,
      isDemo: true,
    };
    const mediaData = {
      kind: post.kind === "video" ? "VIDEO" as const : "IMAGE" as const,
      storageKey: post.path,
      mimeType: post.kind === "video" ? "video/mp4" : "image/jpeg",
      posterKey: posterDiskKey(post.poster),
      durationMs: post.durationMs ?? null,
      width: post.width ?? null,
      height: post.height ?? null,
      private: post.kind === "video" && !post.free,
      isDemo: true,
    };
    if (!existing?.postId) {
      await prisma.post.create({
        data: {
          creatorId,
          ...data,
          media: { create: { ...mediaData, ...(post.mediaId ? { id: post.mediaId } : {}) } },
        },
      });
    } else {
      await prisma.post.update({ where: { id: existing.postId }, data });
      await prisma.media.update({ where: { id: existing.id }, data: mediaData });
    }
  }
}

async function versionStoredAssetUrls() {
  const profiles = await prisma.profile.findMany({
    select: { id: true, avatarUrl: true, coverUrl: true },
  });
  for (const profile of profiles) {
    const avatarUrl = profile.avatarUrl ? withAssetVersion(profile.avatarUrl) : profile.avatarUrl;
    const coverUrl = profile.coverUrl ? withAssetVersion(profile.coverUrl) : profile.coverUrl;
    if (avatarUrl !== profile.avatarUrl || coverUrl !== profile.coverUrl) {
      await prisma.profile.update({ where: { id: profile.id }, data: { avatarUrl, coverUrl } });
    }
  }
  const media = await prisma.media.findMany({ select: { id: true, storageKey: true } });
  for (const item of media) {
    const storageKey = withAssetVersion(item.storageKey);
    if (storageKey !== item.storageKey) {
      await prisma.media.update({ where: { id: item.id }, data: { storageKey } });
    }
  }
}

async function seedInitialCreators() {
  for (const [index, creator] of initialCreators.entries()) {
    const createdAt = launchCreatorCreatedAt(index);
    const email = `${creator.slug}@creators.patrocino.com`;
    const user = await ensureUser({
      email,
      passwordHash: demoPasswordHash,
      role: "CREATOR",
      isDemo: true,
      createdAt,
    });
    await ensureProfile({
      userId: user.id,
      name: creator.displayName,
      username: creator.slug,
      bio: creator.bio,
      city: creator.city,
      avatarUrl: modelMediaPath(creator.slug, imageFile(1)),
      coverUrl: modelMediaPath(creator.slug, imageFile(2)),
      isDemo: true,
    });
    const row = await ensureCreator({
      userId: user.id,
      status: "ACTIVE",
      category: creator.category,
      ownership: "HOUSE",
      fictitious: true,
      isDemo: true,
      createdAt,
    });
    for (const [months, discount] of [[1, 0], [3, 10], [6, 20], [12, 30]] as const) {
      const name = months === 1 ? "Mensal" : `${months} meses`;
      await ensurePlan({
        creatorId: row.id,
        name,
        description: "Assinatura mensal.",
        priceCents: creator.monthlyPriceCents * months,
        durationMonths: months,
        discountPercent: discount,
        isDemo: true,
      });
    }
    for (const [postIndex, post] of initialPosts(creator).entries()) {
      const publishedAt = launchPostPublishedAt(index, postIndex);
      const bareKey = post.path.split("?")[0] ?? post.path;
      const existing = await prisma.media.findFirst({
        where: {
          post: { creatorId: row.id },
          OR: [{ storageKey: bareKey }, { storageKey: { startsWith: `${bareKey}?` } }],
        },
        select: { id: true, postId: true, storageKey: true },
      });
      if (!existing?.postId) {
        await prisma.post.create({
          data: {
            creatorId: row.id,
            caption: post.caption,
            visibility: post.free ? "FREE" : "SUBSCRIBERS",
            likeCount: post.likes,
            publishedAt,
            isDemo: true,
            media: { create: { kind: "IMAGE", storageKey: post.path, mimeType: "image/jpeg", isDemo: true } },
          },
        });
      } else {
        await prisma.post.update({
          where: { id: existing.postId },
          data: {
            caption: post.caption,
            visibility: post.free ? "FREE" : "SUBSCRIBERS",
            likeCount: post.likes,
            publishedAt,
          },
        });
        if (existing.storageKey !== post.path) {
          await prisma.media.update({ where: { id: existing.id }, data: { storageKey: post.path } });
        }
      }
    }
  }
}

async function ensureSeedAdmins() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      const suffix = Date.now().toString(36);
      await prisma.user.create({
        data: {
          email,
          passwordHash: await hash(password, 12),
          role: "ADMIN",
          emailVerifiedAt: new Date(),
          profile: { create: { name: "Admin", username: `admin-${suffix}` } },
        },
      });
    }
  }
  if (process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production") {
    const existing = await prisma.user.findUnique({ where: { email: "admin@patrocino.com" } });
    if (!existing) {
      const suffix = Date.now().toString(36);
      await prisma.user.create({
        data: {
          email: "admin@patrocino.com",
          passwordHash: demoPasswordHash,
          role: "ADMIN",
          emailVerifiedAt: new Date(),
          isDemo: true,
          profile: { create: { name: "Admin Demo", username: `admin-${suffix}`, isDemo: true } },
        },
      });
    }
  }
}

export async function disconnectSeed() {
  await prisma.$disconnect();
}

const entry = process.argv[1]?.replaceAll("\\", "/") ?? "";
if (entry.endsWith("/prisma/seed.ts") || entry.endsWith("/prisma/seed.js")) {
  seedDatabase()
    .finally(async () => prisma.$disconnect())
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
