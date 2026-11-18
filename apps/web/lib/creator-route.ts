const RESERVED = new Set([
  "api",
  "admin",
  "auth",
  "checkout",
  "creator",
  "l",
  "r",
  "media",
  "feed",
  "chat",
  "busca",
  "conta",
  "painel",
  "afiliados",
  "topcreators",
  "onboarding",
  "verificacao",
  "termos",
  "privacidade",
  "reembolso",
  "diretrizes",
  "marca",
  "definir-senha",
  "legal",
  "icons",
  "assinaturas",
  "assinatura",
]);

/** Creator slug for /creator/[slug], /l/[slug], and the short /[slug] profile. */
export function creatorSlugFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  if (parts.length === 2 && (parts[0] === "creator" || parts[0] === "l") && parts[1]) return parts[1];
  if (parts.length === 1 && parts[0] && !RESERVED.has(parts[0].toLowerCase())) return parts[0];
  return null;
}

const CARRY_KEYS = ["ref", "sub", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"] as const;

/** Keep ref, sub, and campaign params on a link. A missing ref falls back to the attribution cookie. */
export function withCampaignQuery(
  href: string,
  search: URLSearchParams,
  cookie?: { code?: string; subId?: string } | null,
) {
  const url = new URL(href, "https://patrocino.local");
  for (const key of CARRY_KEYS) {
    const value = search.get(key);
    if (value) url.searchParams.set(key, value);
  }
  if (!url.searchParams.get("ref") && cookie?.code) url.searchParams.set("ref", cookie.code);
  if (!url.searchParams.get("sub") && cookie?.subId && cookie.subId !== "direct") url.searchParams.set("sub", cookie.subId);
  return `${url.pathname}${url.search}`;
}
