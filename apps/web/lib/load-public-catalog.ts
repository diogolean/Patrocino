import { cookies, headers } from "next/headers";
import { apiBase } from "@/lib/api-auth";
import { visitorForwardHeaders } from "@/lib/client-ip";
import { creators as fixtureCreators, posts as fixturePosts, type Creator, type Post } from "@/lib/fixtures";
import { mergePublicCreators, parseDatabaseCreators, parseDatabaseProfile, parseGalleryPage } from "@/lib/public-catalog";
import { ACCESS_COOKIE } from "@/lib/session-cookies";

export type PublicPostQuote = {
  amountCents: number;
  currency: "BRL" | "USD";
  authenticated: boolean;
  subscriberCents: number | null;
  subscribed: boolean;
};

export function parsePublicPostQuote(payload: unknown): PublicPostQuote | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as {
    amountCents?: unknown;
    currency?: unknown;
    authenticated?: unknown;
    subscriberCents?: unknown;
    subscribed?: unknown;
  };
  if (typeof body.amountCents !== "number" || !Number.isInteger(body.amountCents) || body.amountCents <= 0) return null;
  return {
    amountCents: body.amountCents,
    currency: body.currency === "USD" ? "USD" : "BRL",
    authenticated: body.authenticated === true,
    subscriberCents: typeof body.subscriberCents === "number" ? body.subscriberCents : null,
    subscribed: body.subscribed === true,
  };
}

async function readJson(path: string) {
  const headerList = await headers();
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      headers: visitorForwardHeaders(headerList),
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function loadMergedCreators(): Promise<{ creators: Creator[]; posts: Post[] }> {
  const parsed = parseDatabaseCreators(await readJson("/creators"));
  const fixtureNames = new Set(fixtureCreators.map((creator) => creator.username.toLowerCase()));
  const extraIds = new Set(parsed.creators.filter((creator) => !fixtureNames.has(creator.username.toLowerCase())).map((creator) => creator.id));
  return {
    creators: mergePublicCreators(fixtureCreators, parsed.creators),
    posts: [...fixturePosts, ...parsed.posts.filter((post) => extraIds.has(post.creatorId))],
  };
}

export async function loadDatabaseProfile(username: string) {
  return parseDatabaseProfile(await readJson(`/creators/${encodeURIComponent(username)}`));
}

/** Guest video price for the first HTML of /checkout?kind=post. A signed-in fan is quoted as themselves. */
export async function loadPublicPostQuote(creatorId: string, postId: string) {
  const headerList = await headers();
  const jar = await cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;
  try {
    const response = await fetch(`${apiBase()}/payments/quote`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(access ? { authorization: `Bearer ${access}` } : {}),
        ...visitorForwardHeaders(headerList),
      },
      body: JSON.stringify({ creatorId, purpose: "post", subjectId: postId }),
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return null;
    return parsePublicPostQuote(await response.json());
  } catch {
    return null;
  }
}

export async function loadCreatorGalleryPage(username: string, input: { tab: string; offset: number; seed: string; limit?: number }) {
  const params = new URLSearchParams({
    tab: input.tab,
    offset: String(input.offset),
    seed: input.seed,
    limit: String(input.limit ?? 24),
  });
  const headerList = await headers();
  try {
    const response = await fetch(`${apiBase()}/creators/${encodeURIComponent(username)}/gallery?${params}`, {
      headers: visitorForwardHeaders(headerList),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    return parseGalleryPage(await response.json());
  } catch {
    return null;
  }
}
