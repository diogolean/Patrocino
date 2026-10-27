import Link from "next/link";
import { Check } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PushOptIn } from "@/components/push-opt-in";

export default async function SubscriptionSuccessPage() {
  const t = await getTranslations("billing");
  return (
    <main className="mx-auto grid min-h-[70vh] w-full max-w-lg place-items-center px-4 py-10">
      <section className="w-full rounded-[32px] border border-border bg-elevated p-8 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-500/15 text-emerald-600">
          <Check className="size-8" />
        </span>
        <h1 className="mt-5 text-2xl font-extrabold tracking-[-.04em]">{t("successTitle")}</h1>
        <p className="mt-3 text-sm leading-6 text-muted">{t("successBody")}</p>
        <PushOptIn className="mt-6" />
        <Link href="/assinaturas" className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-bold text-ink">
          {t("mine")}
        </Link>
      </section>
    </main>
  );
}
