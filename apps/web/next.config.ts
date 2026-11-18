import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { visitorCacheHeaders } from "@mimelux/core/currency";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const visitorHeaders = Object.entries(visitorCacheHeaders()).map(([key, value]) => ({ key, value }));

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  transpilePackages: ["@mimelux/ui", "@mimelux/core"],
  async headers() {
    const priced = [
      "/creator/:username",
      "/l/:slug",
      "/checkout",
      "/api/creators",
      "/api/creators/:username",
      "/api/creators/:username/gallery",
      "/api/creators/:username/subscriber-videos",
    ];
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      ...priced.map((source) => ({ source, headers: visitorHeaders })),
    ];
  },
};

export default withNextIntl(nextConfig);
