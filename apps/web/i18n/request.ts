import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { resolveRequestLocale } from "./locale";

export { locales, resolveLocale, resolveRequestLocale } from "./locale";
export type { AppLocale } from "./locale";

export default getRequestConfig(async () => {
  const jar = await cookies();
  const header = await headers();
  const locale = resolveRequestLocale({
    cookie: jar.get("mimelux-locale")?.value,
    acceptLanguage: header.get("accept-language"),
    cfIpCountry: header.get("cf-ipcountry"),
    xCountry: header.get("x-vercel-ip-country") ?? header.get("x-patrocino-country") ?? header.get("x-country"),
  });
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
