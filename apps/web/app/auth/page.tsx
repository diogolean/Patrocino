"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Logo, Mark } from "@mimelux/ui";
import {
  loginSchema,
  registerSchema,
  type AccountRole,
} from "@mimelux/core";
import { bindAttribution } from "@/lib/affiliates";
import { readDemo, writeDemo } from "@/lib/demo-store";
import { loginAccount, registerAccount, sessionErrorText } from "@/lib/session";
import { creators, posts } from "@/lib/gateway";
import { LanguageSwitcher } from "@/components/language-switcher";
import { MonetizeSection } from "@/components/monetize-section";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";
import { roleHome } from "@/lib/use-role-guard";
import { authHref, postSignUpPath, safeReturnPath } from "@/lib/auth-return";

function AuthContent() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations("auth");
  const page = useTranslations("authPage");
  const errors = useTranslations("errors");
  const locale = useLocale();
  const signUp = params.get("route") === "sign-up";
  const nextPath = safeReturnPath(params.get("next"));
  const requestedRole = params.get("role");
  const preset = requestedRole === "creator" || requestedRole === "affiliate" ? requestedRole : "fan";
  const [role, setRole] = useState<AccountRole>(preset);
  const [professional, setProfessional] = useState(preset !== "fan");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedCreatorTerms, setAcceptedCreatorTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleOn, setGoogleOn] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancel = false;
    fetch("/api/auth/google", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : { enabled: false }))
      .then((payload: { enabled?: boolean }) => {
        if (!cancel) setGoogleOn(payload.enabled === true);
      })
      .catch(() => {
        if (!cancel) setGoogleOn(false);
      });
    return () => {
      cancel = true;
    };
  }, []);
  const featuredCreator = creators[0]!;
  const featuredPost = posts[0]!;

  function chooseRole(next: AccountRole) {
    setRole(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const result = signUp
      ? registerSchema.safeParse({
          name: form.get("name"),
          email,
          password,
          role: role ?? "fan",
        })
      : loginSchema.safeParse({ identifier: email, password });

    if (!result.success) {
      setError(signUp ? page("signupInvalid") : page("loginInvalid"));
      return;
    }
    const chosen: AccountRole = professional ? (role === "affiliate" ? "affiliate" : "creator") : "fan";
    if (signUp && (!acceptedTerms || (chosen === "creator" && !acceptedCreatorTerms))) {
      setError(t("acceptRequired"));
      return;
    }
    setLoading(true);
    try {
      if (signUp && result.success && "name" in result.data) {
        writeDemo(bindAttribution(readDemo(), email));
        await registerAccount({
          name: result.data.name,
          email: result.data.email,
          password,
          role: chosen,
          acceptTerms: true,
          acceptCreatorTerms: chosen === "creator",
          locale,
          next: nextPath ?? undefined,
        });
        router.push(postSignUpPath(nextPath));
        return;
      }
      const user = await loginAccount(email, password);
      writeDemo({ onboarding: true, coachSeen: true });
      router.push(nextPath ?? roleHome(user.role));
    } catch (caught) {
      setError(sessionErrorText(caught, errors, signUp ? page("registerFailed") : page("enterFailed")));
    } finally {
      setLoading(false);
    }
  }

  function startGoogle() {
    const nextRole: AccountRole = professional ? (role === "affiliate" ? "affiliate" : "creator") : "fan";
    if (signUp && (!acceptedTerms || (nextRole === "creator" && !acceptedCreatorTerms))) {
      setError(t("acceptRequired"));
      return;
    }
    const params = new URLSearchParams();
    if (nextPath) params.set("next", nextPath);
    if (signUp) params.set("role", nextRole);
    window.location.assign(`/api/auth/google/start?${params.toString()}`);
  }

  return (
    <main className="bg-background">
      <div className="relative grid min-h-dvh w-full grid-cols-1 overflow-x-hidden lg:grid-cols-[minmax(480px,0.9fr)_1.1fr]">
      <section className="relative z-10 flex min-h-dvh w-full min-w-0 items-center justify-center px-4 py-8 sm:px-10 sm:py-10 lg:px-14">
        <div className="w-full min-w-0 max-w-[440px] animate-enter">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
            <Logo />
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <LanguageSwitcher compact />
            </div>
          </div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[.22em] text-primary-strong">
            {signUp ? t("signupEyebrow") : t("loginEyebrow")}
          </p>
          <h1 className="text-3xl font-extrabold tracking-[-.04em] sm:text-4xl">
            {signUp ? t("signupTitle") : t("loginTitle")}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            {signUp ? t("signupBody") : t("loginBody")}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-3">
            {signUp && (
              <input
                name="name"
                aria-label={t("name")}
                placeholder={t("name")}
                autoComplete="name"
                className="h-13 w-full rounded-full border border-black/8 bg-white/70 px-5 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15 dark:bg-white/5"
              />
            )}
            <input
              name="email"
              aria-label={t("identifier")}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={signUp ? t("email") : t("identifierPlaceholder")}
              autoComplete="email"
              className="h-13 w-full rounded-full border border-black/8 bg-white/70 px-5 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15 dark:bg-white/5"
            />
            <div className="relative">
              <input
                name="password"
                aria-label={t("password")}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type={visible ? "text" : "password"}
                placeholder={t("password")}
                autoComplete={signUp ? "new-password" : "current-password"}
                className="h-13 w-full rounded-full border border-black/8 bg-white/70 px-5 pr-13 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15 dark:bg-white/5"
              />
              <button
                type="button"
                aria-label={visible ? t("hidePassword") : t("showPassword")}
                onClick={() => setVisible((value) => !value)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted"
              >
                {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {!signUp && (
              <div className="flex justify-end">
                <button type="button" onClick={() => toast.info(t("forgotDemo"))} className="text-xs font-semibold text-muted hover:text-foreground">
                  {t("forgot")}
                </button>
              </div>
            )}
            {error && (
              <p role="alert" className="rounded-2xl bg-accent/25 px-4 py-3 text-xs font-medium">
                {error}
              </p>
            )}
            <RoleSwitch
              professional={professional}
              role={role}
              label={t("roleSwitch")}
              hint={t("roleSwitchHint")}
              creatorLabel={t("creator")}
              affiliateLabel={t("affiliate")}
              onProfessional={(next) => {
                setProfessional(next);
                chooseRole(next ? (role === "affiliate" ? "affiliate" : "creator") : "fan");
              }}
              onRole={chooseRole}
            />
            {signUp && (
              <div className="space-y-3 pt-1">
                <label className="flex items-start gap-3 text-xs leading-5 text-muted">
                  <input
                    type="checkbox"
                    data-testid="accept-terms"
                    checked={acceptedTerms}
                    onChange={(event) => setAcceptedTerms(event.target.checked)}
                    required
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                  />
                  <span>
                    {t.rich("acceptAge", {
                      terms: (chunks) => (
                        <Link href="/termos" className="font-bold text-foreground underline">
                          {chunks}
                        </Link>
                      ),
                      privacy: (chunks) => (
                        <Link href="/privacidade" className="font-bold text-foreground underline">
                          {chunks}
                        </Link>
                      ),
                    })}
                  </span>
                </label>
                {professional && role === "creator" && (
                  <label className="flex items-start gap-3 text-xs leading-5 text-muted">
                    <input
                      type="checkbox"
                      data-testid="accept-creator-terms"
                      checked={acceptedCreatorTerms}
                      onChange={(event) => setAcceptedCreatorTerms(event.target.checked)}
                      required
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                    />
                    <span>
                      {t.rich("acceptCreator", {
                        creator: (chunks) => (
                          <Link href="/termos#criador" className="font-bold text-foreground underline">
                            {chunks}
                          </Link>
                        ),
                      })}
                    </span>
                  </label>
                )}
              </div>
            )}
            <Button type="submit" size="lg" className="mt-2 w-full" disabled={loading}>
              {loading ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {signUp ? t("continue") : t("enter")}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3 text-[11px] text-muted before:h-px before:flex-1 before:bg-black/10 after:h-px after:flex-1 after:bg-black/10">
            {t("or")}
          </div>

          {googleOn ? (
            <button
              type="button"
              data-testid="google-sign-in"
              onClick={startGoogle}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-black/8 bg-white/80 text-sm font-bold transition hover:bg-white dark:bg-white/5"
            >
              <span className="text-base font-black">G</span>
              {signUp ? t("googleSignUp") : t("googleSignIn")}
            </button>
          ) : null}

          <p className="mt-7 text-center text-xs text-muted">
            {signUp ? t("hasAccount") : t("noAccount")}{" "}
            <Link
              href={authHref(signUp ? "sign-in" : "sign-up", nextPath)}
              className="font-bold text-primary-strong hover:underline"
            >
              {signUp ? t("signIn") : t("signUp")}
            </Link>
          </p>
        </div>
      </section>

      <aside className="relative m-3 hidden min-h-[calc(100dvh-1.5rem)] overflow-hidden rounded-[36px] bg-surface lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_18%,rgba(233,176,167,.8),transparent_24rem),radial-gradient(circle_at_20%_90%,rgba(233,161,94,.42),transparent_25rem)]" />
        <div className="absolute left-12 top-12 flex items-center gap-2 rounded-full border border-white/60 bg-white/50 px-4 py-2 text-xs font-semibold backdrop-blur">
          <ShieldCheck className="size-4 text-primary-strong" />
          {t("panelBadge")}
        </div>
        <div className="absolute inset-x-0 top-[16%] flex justify-center">
          <div className="relative h-[480px] w-[310px] [animation:float_6s_ease-in-out_infinite]">
            <div className="absolute inset-0 rotate-[-6deg] rounded-[44px] bg-ink/10" />
            <div className="absolute inset-0 overflow-hidden rounded-[44px] border-[7px] border-white bg-white shadow-[0_30px_80px_rgba(32,32,39,.18)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={featuredPost.image} alt={page("demoAlt", { name: featuredCreator.name })} className="h-[68%] w-full object-cover" />
              <div className="p-5">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={featuredCreator.avatar} alt="" className="size-11 rounded-full object-cover" />
                  <div>
                    <p className="text-sm font-extrabold text-ink">{featuredCreator.name}</p>
                    <p className="text-[10px] text-black/50">@{featuredCreator.username}</p>
                  </div>
                </div>
                <div className="mt-4 h-2 w-full rounded-full bg-surface" />
                <div className="mt-2 h-2 w-3/5 rounded-full bg-surface" />
              </div>
            </div>
            <span
              data-testid="auth-mark"
              className="absolute -right-8 top-20 grid size-16 place-items-center rounded-3xl bg-foreground text-background shadow-xl"
            >
              <Mark className="size-10" />
            </span>
          </div>
        </div>
        <div className="absolute inset-x-12 bottom-12">
          <h2 className="max-w-lg text-4xl font-extrabold leading-[1.1] tracking-[-.045em] text-foreground">
            {t("panelTitle")}
          </h2>
          <p className="mt-4 max-w-md text-sm leading-6 text-muted">
            {t("panelBody")}
          </p>
        </div>
      </aside>
      </div>
      {!signUp && <MonetizeSection />}
    </main>
  );
}

function RoleSwitch({
  professional,
  role,
  label,
  hint,
  creatorLabel,
  affiliateLabel,
  onProfessional,
  onRole,
}: {
  professional: boolean;
  role: AccountRole;
  label: string;
  hint: string;
  creatorLabel: string;
  affiliateLabel: string;
  onProfessional: (next: boolean) => void;
  onRole: (role: AccountRole) => void;
}) {
  return (
    <div data-testid="role-switch" className="pt-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-0.5 text-[11px] text-muted">{hint}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={professional}
          aria-label={label}
          onClick={() => onProfessional(!professional)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${professional ? "bg-primary-strong" : "bg-muted/30"}`}
        >
          <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${professional ? "left-6" : "left-1"}`} />
        </button>
      </div>
      {professional && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {([
            ["creator", creatorLabel],
            ["affiliate", affiliateLabel],
          ] as const).map(([value, text]) => (
            <button
              key={value}
              type="button"
              aria-pressed={role === value}
              onClick={() => onRole(value)}
              className={`h-11 rounded-full text-sm font-semibold transition ${
                role === value ? "bg-ink text-white dark:bg-primary dark:text-ink" : "border border-border bg-elevated text-foreground"
              }`}
            >
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh skeleton" />}>
      <AuthContent />
    </Suspense>
  );
}
