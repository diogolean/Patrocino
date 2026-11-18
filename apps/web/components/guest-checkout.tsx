"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LoaderCircle } from "lucide-react";
import { Button } from "@mimelux/ui";
import { registerSchema } from "@mimelux/core";
import { loginAccount, registerAccount, SessionRequestError, sessionErrorText } from "@/lib/session";

export function GuestCheckout({ nextPath, onSignedIn }: { nextPath: string; onSignedIn: () => void }) {
  const t = useTranslations("checkout");
  const auth = useTranslations("auth");
  const errors = useTranslations("errors");
  const locale = useLocale();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [googleOn, setGoogleOn] = useState(false);
  const [mode, setMode] = useState<"sign-up" | "sign-in">("sign-up");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancel = false;
    fetch("/api/auth/google", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : { enabled: false }))
      .then((payload: { enabled?: boolean }) => {
        if (!cancel) setGoogleOn(payload.enabled === true);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (mode === "sign-in") {
      setLoading(true);
      try {
        await loginAccount(email, password);
        onSignedIn();
      } catch (caught) {
        setError(sessionErrorText(caught, errors, t("guestFailed")));
      } finally {
        setLoading(false);
      }
      return;
    }
    const parsed = registerSchema.safeParse({ name, email, password, role: "fan" });
    if (!parsed.success || !accepted) {
      setError(!parsed.success ? t("guestInvalid") : auth("acceptRequired"));
      return;
    }
    setLoading(true);
    try {
      await registerAccount({
        name: parsed.data.name,
        email: parsed.data.email,
        password,
        role: "fan",
        acceptTerms: true,
        locale,
        next: nextPath,
      });
      onSignedIn();
    } catch (caught) {
      if (caught instanceof SessionRequestError && caught.code === "EMAIL_ALREADY_REGISTERED") {
        try {
          await loginAccount(email, password);
          onSignedIn();
          return;
        } catch (loginError) {
          setError(sessionErrorText(loginError, errors, t("guestFailed")));
          return;
        }
      }
      setError(sessionErrorText(caught, errors, t("guestFailed")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} data-testid="guest-checkout" className="mt-2 w-full max-w-sm space-y-3 text-left">
      <p className="text-center text-sm font-extrabold">{mode === "sign-up" ? t("guestTitle") : t("guestSignInTitle")}</p>
      <p className="text-center text-xs leading-5 text-muted">{t("guestBody")}</p>
      {mode === "sign-up" && (
        <input
          aria-label={t("guestName")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("guestName")}
          autoComplete="name"
          className="h-12 w-full rounded-full border border-black/10 bg-white px-4 text-sm outline-none focus:border-primary dark:bg-white/5"
        />
      )}
      <input
        aria-label={t("guestEmail")}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder={t("guestEmail")}
        autoComplete="email"
        className="h-12 w-full rounded-full border border-black/10 bg-white px-4 text-sm outline-none focus:border-primary dark:bg-white/5"
      />
      <input
        aria-label={t("guestPassword")}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        type="password"
        placeholder={t("guestPassword")}
        autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
        className="h-12 w-full rounded-full border border-black/10 bg-white px-4 text-sm outline-none focus:border-primary dark:bg-white/5"
      />
      {mode === "sign-up" && (
        <label className="flex items-start gap-2 text-xs leading-5 text-muted">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-0.5 size-4 accent-primary" />
          <span>
            {auth.rich("acceptAge", {
              terms: (chunks) => <Link href="/termos" className="font-bold text-foreground underline">{chunks}</Link>,
              privacy: (chunks) => <Link href="/privacidade" className="font-bold text-foreground underline">{chunks}</Link>,
            })}
          </span>
        </label>
      )}
      {error ? <p role="alert" className="text-center text-sm text-accent-strong">{error}</p> : null}
      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading ? <LoaderCircle className="size-4 animate-spin" /> : null}
        {loading ? t("guestCreating") : mode === "sign-up" ? t("guestContinue") : t("guestSignIn")}
      </Button>
      {googleOn ? (
        <Button type="button" size="lg" variant="outline" className="w-full" onClick={() => {
          if (mode === "sign-up" && !accepted) {
            setError(auth("acceptRequired"));
            return;
          }
          const params = new URLSearchParams({ role: "fan" });
          if (nextPath) params.set("next", nextPath);
          window.location.assign(`/api/auth/google/start?${params.toString()}`);
        }}>
          {t("guestGoogle")}
        </Button>
      ) : null}
      <button type="button" className="w-full text-center text-xs font-semibold text-muted" onClick={() => setMode((value) => (value === "sign-up" ? "sign-in" : "sign-up"))}>
        {mode === "sign-up" ? t("guestHaveAccount") : t("guestNeedAccount")}
      </button>
    </form>
  );
}
