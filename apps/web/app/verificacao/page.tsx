"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, Logo } from "@mimelux/ui";
import { contentMode } from "@mimelux/core";
import { mockDelay, writeDemo } from "@/lib/demo-store";
import { getSessionSnapshot } from "@/lib/session";

export default function VerificationPage() {
  const router = useRouter();
  const t = useTranslations("verify");
  const [code, setCode] = useState(["2", "2", "4", "4", "8", "8"]);
  const [age, setAge] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const needsAge = contentMode !== "general";
  const label = useMemo(
    () =>
      contentMode === "adult"
        ? t("adult")
        : contentMode === "hybrid"
          ? t("hybrid")
          : t("general"),
    [t],
  );

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (code.join("") !== "224488") {
      setError(t("invalidCode"));
      return;
    }
    if (needsAge && !age) {
      setError(t("ageRequired"));
      return;
    }
    setError("");
    setLoading(true);
    await mockDelay();
    writeDemo({ verified: true });
    const role = getSessionSnapshot().user?.role ?? "fan";
    router.push(`/onboarding?role=${role}`);
  }

  return (
    <main className="grid min-h-dvh place-items-center px-5 py-8">
      <section className="relative w-full max-w-xl overflow-hidden rounded-[32px] border border-black/5 bg-white/70 p-6 shadow-[0_30px_90px_rgba(32,32,39,.1)] backdrop-blur sm:p-10 dark:bg-white/5">
        <div className="absolute -right-16 -top-20 size-56 rounded-full bg-accent/30 blur-3xl" />
        <button
          onClick={() => router.back()}
          className="relative mb-8 grid size-10 place-items-center rounded-full border border-black/10 bg-white/50 transition hover:bg-white dark:bg-white/5"
          aria-label={t("back")}
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="relative">
          <Logo compact />
          <div className="mt-9 grid size-14 place-items-center rounded-2xl bg-primary/20 text-primary-strong">
            <Mail className="size-6" />
          </div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[.2em] text-primary-strong">{t("eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-.04em]">{t("title")}</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted">{t("body")}</p>

          <form onSubmit={verify} className="mt-8">
            <div className="grid grid-cols-6 gap-2">
              {code.map((digit, index) => (
                <input
                  key={index}
                  aria-label={t("digit", { index: index + 1 })}
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(event) => {
                    const next = [...code];
                    next[index] = event.target.value.replace(/\D/g, "");
                    setCode(next);
                  }}
                  className="aspect-square min-w-0 rounded-2xl border border-black/8 bg-surface/65 text-center text-lg font-extrabold outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 dark:bg-white/5"
                />
              ))}
            </div>

            {needsAge && (
              <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-black/6 bg-surface/45 p-4 dark:bg-white/5">
                <input
                  type="checkbox"
                  checked={age}
                  onChange={(event) => setAge(event.target.checked)}
                  className="mt-1 size-4 accent-primary"
                />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-bold">
                    <ShieldCheck className="size-4 text-primary-strong" />
                    {t("ageTitle")}
                  </span>
                  <span className="mt-1 block text-[11px] leading-5 text-muted">{t("ageBody", { label })}</span>
                </span>
              </label>
            )}

            {error && <p className="mt-4 text-xs font-semibold text-red-600">{error}</p>}
            <Button type="submit" size="lg" className="mt-6 w-full" disabled={loading}>
              {loading ? t("checking") : <><CheckCircle2 className="size-4" /> {t("submit")}</>}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
