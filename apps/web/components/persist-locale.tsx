"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { writeLocaleCookie, type AppLocale } from "@/i18n/locale";

export function PersistLocaleCookie() {
  const locale = useLocale() as AppLocale;
  useEffect(() => {
    const hasCookie = document.cookie.split(";").some((part) => part.trim().startsWith("mimelux-locale="));
    if (!hasCookie) writeLocaleCookie(locale);
  }, [locale]);
  return null;
}
