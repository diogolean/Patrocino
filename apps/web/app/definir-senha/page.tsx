"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Logo } from "@mimelux/ui";

function SetPasswordForm() {
  const t = useTranslations("setPassword");
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 8) return setError(t("tooShort"));
    if (password !== confirm) return setError(t("mismatch"));
    setState("saving");
    const response = await fetch("/api/auth/set-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    }).catch(() => null);
    if (response?.ok) return setState("done");
    setState("idle");
    setError(response?.status === 401 ? t("invalid") : t("failed"));
  }

  if (state === "done") {
    return (
      <div className="space-y-4 text-center" data-testid="set-password-done">
        <p className="text-sm">{t("done")}</p>
        <Link href="/auth?route=sign-in" className="font-bold text-primary-strong">{t("signIn")}</Link>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <h1 className="text-xl font-extrabold">{t("title")}</h1>
      <p className="text-xs text-muted">{t("body")}</p>
      {!token && <p className="text-sm text-red-600">{t("invalid")}</p>}
      <input type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("password")} aria-label={t("password")} className="h-11 w-full rounded-full border border-border bg-background px-4 text-sm" />
      <input type="password" autoComplete="new-password" required value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder={t("confirm")} aria-label={t("confirm")} className="h-11 w-full rounded-full border border-border bg-background px-4 text-sm" />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={!token || state === "saving"} className="h-11 w-full rounded-full">{t("save")}</Button>
    </form>
  );
}

export default function SetPasswordPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 rounded-3xl border border-border bg-elevated/70 p-6">
        <Logo compact />
        <Suspense>
          <SetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
