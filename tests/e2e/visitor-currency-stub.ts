import { createServer } from "node:http";
import { currencyFromHeaderMap } from "../../apps/api/src/http/visitor-currency";

const port = Number(process.env.PORT ?? 3394);

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/v1/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
    return;
  }
  const match = url.pathname.match(/^\/v1\/creators\/([^/]+)$/);
  if (!match || req.method !== "GET") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end("null");
    return;
  }
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers[key] = value;
  }
  const currency = currencyFromHeaderMap(headers);
  const cents = currency === "USD" ? 800 : 3900;
  const username = decodeURIComponent(match[1] ?? "");
  res.writeHead(200, { "content-type": "application/json", "cache-control": "private, no-store" });
  res.end(
    JSON.stringify({
      id: username,
      name: "Sophie Bennet",
      username,
      bio: "",
      city: "",
      avatarUrl: "",
      coverUrl: "",
      category: "Lifestyle",
      verified: true,
      isFree: false,
      monthlyPriceCents: cents,
      subscriberCount: 0,
      likeCount: 0,
      fictitious: true,
      aiGenerated: true,
      currency,
      plans: [{ id: "monthly", name: "Mensal", months: 1, chargeCents: cents, promotionPercent: 0, currency }],
      packs: [],
      posts: [],
      photoCount: 0,
      videoCount: 0,
    }),
  );
});

server.listen(port, "127.0.0.1");
