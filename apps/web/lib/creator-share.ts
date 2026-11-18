const crawlers = [
  "facebookexternalhit",
  "facebot",
  "twitterbot",
  "whatsapp",
  "slackbot",
  "telegrambot",
  "discordbot",
  "linkedinbot",
  "pinterest",
  "redditbot",
  "embedly",
  "iframely",
  "skypeuripreview",
  "vkshare",
];

export function isSocialCrawler(userAgent: string | null | undefined) {
  if (!userAgent) return false;
  const hay = userAgent.toLowerCase();
  return crawlers.some((bot) => hay.includes(bot));
}

export function creatorShare(input: { name: string; bio: string; slug: string; origin: string }) {
  const origin = input.origin.replace(/\/$/, "");
  const slug = input.slug.trim();
  const name = input.name.trim() || slug;
  const description = input.bio.replace(/\s+/g, " ").trim().slice(0, 200) || "Conteúdo exclusivo no Patrocino.";
  const url = `${origin}/creator/${encodeURIComponent(slug)}`;
  const image = `${origin}/creator/${encodeURIComponent(slug)}/opengraph-image`;
  return {
    title: `${name} | Patrocino`,
    description,
    url,
    image,
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

export function creatorOgHtml(share: ReturnType<typeof creatorShare>) {
  const title = escapeHtml(share.title);
  const description = escapeHtml(share.description);
  const url = escapeHtml(share.url);
  const image = escapeHtml(share.image);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><link rel="canonical" href="${url}"><meta name="description" content="${description}"><meta property="og:type" content="profile"><meta property="og:site_name" content="Patrocino"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${url}"><meta property="og:image" content="${image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${image}"></head><body></body></html>`;
}

export async function creatorShareFromApi(origin: string, slug: string, apiBaseUrl: string) {
  let name = slug;
  let bio = "";
  try {
    const response = await fetch(`${apiBaseUrl}/creators/${encodeURIComponent(slug)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (response.ok) {
      const data = (await response.json()) as { name?: unknown; bio?: unknown };
      if (typeof data.name === "string" && data.name.trim()) name = data.name.trim();
      if (typeof data.bio === "string") bio = data.bio;
    }
  } catch {
    name = slug;
  }
  return creatorShare({ name, bio, slug, origin });
}
