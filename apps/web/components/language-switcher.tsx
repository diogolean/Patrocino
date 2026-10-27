"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { locales, writeLocaleCookie, type AppLocale } from "@/i18n/locale";

export function LanguageSwitcher({
  compact = false,
  onChange,
}: {
  compact?: boolean;
  onChange?: (locale: AppLocale) => void;
}) {
  const router = useRouter();
  const locale = useLocale();
  const label = useTranslations("nav")("language");

  function select(next: AppLocale) {
    writeLocaleCookie(next);
    void fetch("/api/session/locale", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale: next }),
    });
    if (onChange) onChange(next);
    else router.refresh();
  }

  return (
    <div className="flex gap-1 rounded-full bg-white/70 p-1 dark:bg-white/10" aria-label={label}>
      {locales.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => select(item)}
          aria-pressed={locale === item}
          className={`rounded-full font-bold transition ${
            compact ? "h-8 px-2 text-[10px]" : "h-9 px-3 text-[11px]"
          } ${locale === item ? "bg-ink text-white dark:bg-primary dark:text-ink" : "text-muted hover:text-foreground"}`}
        >
          {item === "pt-BR" ? "PT" : item.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
