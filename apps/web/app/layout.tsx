import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { currencyForVisitor } from "@mimelux/core/currency";
import { VisitorCurrencyProvider } from "@/lib/visitor-currency";
import { PersistLocaleCookie } from "@/components/persist-locale";
import { Providers } from "@/components/providers";
import { SiteFooter } from "@/components/site-footer";
import Script from "next/script";
import { Suspense } from "react";
import { GoogleAnalytics } from "@/components/google-analytics";
import { GA_ID, gaBootstrap } from "@/lib/analytics";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#181725",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://patrocino.com"),
  applicationName: "Patrocino",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Patrocino",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192" }],
  },
  title: {
    default: "Patrocino — perto de quem inspira",
    template: "%s · Patrocino",
  },
  description: "Monetize com a gente do seu jeito. Conteúdo exclusivo, assinaturas e apoio direto aos criadores.",
  openGraph: {
    title: "Patrocino — Monetize com a gente do seu jeito",
    description: "Monetize com a gente do seu jeito. Conteúdo exclusivo, assinaturas e apoio direto aos criadores.",
    siteName: "Patrocino",
    url: "https://patrocino.com",
    locale: "pt_BR",
    type: "website",
    images: [{ url: "/og-patrocino.png", width: 1200, height: 630, alt: "Patrocino — Monetize com a gente do seu jeito" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Patrocino — Monetize com a gente do seu jeito",
    description: "Monetize com a gente do seu jeito. Conteúdo exclusivo, assinaturas e apoio direto aos criadores.",
    images: ["/og-patrocino.png"],
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const header = await headers();
  const currency = currencyForVisitor({
    country: header.get("cf-ipcountry") ?? header.get("x-country"),
    locale: (await cookies()).get("mimelux-locale")?.value,
    acceptLanguage: header.get("accept-language"),
  });
  return (
    <html lang={locale} suppressHydrationWarning>
      {GA_ID ? (
        <head>
          <script id="ga-consent-default" dangerouslySetInnerHTML={{ __html: gaBootstrap(GA_ID) }} />
        </head>
      ) : null}
      <body className={`${poppins.variable} min-h-full antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <VisitorCurrencyProvider currency={currency}>
          <Providers>
            <PersistLocaleCookie />
            {children}
            <SiteFooter />
          </Providers>
          </VisitorCurrencyProvider>
        </NextIntlClientProvider>
        {GA_ID ? <Script id="ga-gtag" src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" /> : null}
        {GA_ID ? (
          <Suspense fallback={null}>
            <GoogleAnalytics />
          </Suspense>
        ) : null}
      </body>
    </html>
  );
}
