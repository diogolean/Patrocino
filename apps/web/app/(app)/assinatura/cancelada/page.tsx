import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function SubscriptionCanceledPage() {
  const t = await getTranslations("billing");
  return (
    <main className="mx-auto grid min-h-[70vh] w-full max-w-lg place-items-center px-4 py-10">
      <section className="w-full rounded-[32px] border border-border bg-elevated p-8 text-center">
        <h1 className="text-2xl font-extrabold tracking-[-.04em]">{t("canceledTitle")}</h1>
        <p className="mt-3 text-sm leading-6 text-muted">{t("canceledBody")}</p>
        <Link href="/assinaturas" className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-bold text-ink">
          {t("mine")}
        </Link>
      </section>
    </main>
  );
}
