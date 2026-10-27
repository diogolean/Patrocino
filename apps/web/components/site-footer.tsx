import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CookiePreferencesButton } from "@/components/cookie-preferences-button";
import { LanguageSwitcher } from "@/components/language-switcher";

const links = [
  ["terms", "/termos"],
  ["privacy", "/privacidade"],
  ["guidelines", "/diretrizes"],
  ["refunds", "/reembolso"],
] as const;

export async function SiteFooter() {
  const footer = await getTranslations("footer");
  return (
    <footer data-testid="site-footer" className="border-t border-border bg-ink px-4 py-8 pb-24 text-white sm:px-8 lg:pb-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-extrabold">Patrocino</p>
          <LanguageSwitcher compact />
        </div>
        <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {links.map(([label, href]) => (
            <Link key={href} href={href} className="text-white/80 hover:text-white">
              {footer(label)}
            </Link>
          ))}
          <CookiePreferencesButton label={footer("cookiePreferences")} />
        </nav>
      </div>
    </footer>
  );
}
