import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { clientIpFrom } from "@/lib/client-ip";
import { lookupCountry, resolveRequestLocale } from "./locale";

export { locales, resolveLocale, resolveRequestLocale } from "./locale";
export type { AppLocale } from "./locale";

export default getRequestConfig(async () => {
  const jar = await cookies();
  const header = await headers();
  const locale = resolveRequestLocale({
    cookie: jar.get("mimelux-locale")?.value,
    acceptLanguage: header.get("accept-language"),
    cfIpCountry: header.get("cf-ipcountry"),
    xCountry: header.get("x-country"),
    ip: clientIpFrom(header) ?? null,
    lookupCountry,
  });
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
