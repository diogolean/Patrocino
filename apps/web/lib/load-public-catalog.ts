import { headers } from "next/headers";
import { apiBase } from "@/lib/api-auth";
import { visitorForwardHeaders } from "@/lib/client-ip";
import { creators as fixtureCreators, posts as fixturePosts, type Creator, type Post } from "@/lib/fixtures";
import { mergePublicCreators, parseDatabaseCreators, parseDatabaseProfile } from "@/lib/public-catalog";

async function readJson(path: string) {
  try {
    const headerList = await headers();
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
