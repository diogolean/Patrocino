import type { ChargeCurrency } from "@mimelux/core/currency";

export type FeaturedPack = {
  id: string;
  name: string;
  priceCents: number;
  itemCount: number;
  username: string;
  creatorName: string;
  avatarUrl: string;
};

export type FeaturedPacks = { currency: ChargeCurrency; items: FeaturedPack[] };

const text = (value: unknown) => (typeof value === "string" ? value : "");

export function parseFeaturedPacks(payload: unknown): FeaturedPacks | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as { currency?: unknown; items?: unknown };
  const currency: ChargeCurrency = body.currency === "BRL" ? "BRL" : "USD";
  if (!Array.isArray(body.items)) return null;
  const items: FeaturedPack[] = [];
  for (const raw of body.items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const id = text(item.id);
    const username = text(item.username);
    const priceCents = Number(item.priceCents);
    if (!id || !/^[a-z0-9-]{2,40}$/.test(username) || !Number.isInteger(priceCents) || priceCents <= 0) continue;
    items.push({
      id,
      name: text(item.name),
      priceCents,
      itemCount: Number.isInteger(item.itemCount) ? (item.itemCount as number) : 0,
      username,
      creatorName: text(item.creatorName) || username,
      avatarUrl: text(item.avatarUrl),
    });
  }
  return { currency, items };
}

export function packCheckoutHref(pack: Pick<FeaturedPack, "id" | "username">) {
  return `/checkout?kind=pack&id=${encodeURIComponent(pack.id)}&creator=${pack.username}&return=/creator/${pack.username}`;
}
