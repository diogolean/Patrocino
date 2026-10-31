"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@mimelux/ui";
import { AccountCharacterCard } from "@/components/character-card";
import { getServerSessionSnapshot, getSessionSnapshot, logoutAccount, subscribeSession } from "@/lib/session";
import { useSignedIn } from "@/lib/use-signed-in";

export default function AccountPage() {
  const ready = useSignedIn();
  const t = useTranslations("account");
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  if (!ready) return <div className="m-6 h-64 rounded-[30px] skeleton" />;

  async function download() {
    setExporting(true);
    setNotice("");
    try {
      const response = await fetch("/api/privacy/export", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.status === 429) {
        setNotice(t("exportLimited"));
        return;
      }
      if (!response.ok) throw new Error("export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "patrocino-dados.json";
      link.click();
      URL.revokeObjectURL(url);
      setNotice(t("exportDone"));
    } catch {
      setNotice(t("exportLimited"));
    } finally {
      setExporting(false);
    }
  }

  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeleting(true);
    setError("");
    try {
      const response = await fetch("/api/privacy/deletion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, confirm }),
      });
      if (response.status === 401) {
        setError(t("wrongPassword"));
        return;
      }
      if (!response.ok) {
        setError(t("confirmHint"));
        return;
      }
      await logoutAccount();
      router.push("/auth?route=sign-in");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8 sm:px-6">
      <p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary-strong">{t("eyebrow")}</p>
      {session.user ? (
        <div className="mt-4" data-testid="account-panel">
          <AccountCharacterCard user={session.user} />
        </div>
      ) : null}
      <h1 className="mt-2 text-3xl font-extrabold tracking-[-.04em]">{t("title")}</h1>
      <p className="mt-3 text-sm leading-6 text-muted">{t("body")}</p>

      <section className="mt-6 rounded-[28px] border border-border bg-elevated p-5">
        <h2 className="text-base font-extrabold">{t("export")}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{t("exportHelp")}</p>
        <Button type="button" data-testid="export-data" className="mt-4" onClick={() => void download()} disabled={exporting}>
          {t("export")}
        </Button>
        {notice && <p className="mt-3 text-sm text-muted">{notice}</p>}
      </section>

      <section className="mt-4 rounded-[28px] border border-border bg-elevated p-5">
        <h2 className="text-base font-extrabold">{t("delete")}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{t("deleteHelp")}</p>
        {!open ? (
          <Button type="button" data-testid="delete-account" variant="outline" className="mt-4" onClick={() => setOpen(true)}>
            {t("delete")}
          </Button>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={(event) => void remove(event)}>
            <label className="block text-xs font-semibold">
              {t("password")}
              <input
                data-testid="delete-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className="mt-1 h-11 w-full rounded-2xl border border-border bg-surface/60 px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
            <label className="block text-xs font-semibold">
              {t("confirm")}
              <input
                data-testid="delete-confirm"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className="mt-1 h-11 w-full rounded-2xl border border-border bg-surface/60 px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm font-semibold text-accent-strong">
                {error}
              </p>
            )}
            <Button type="submit" data-testid="delete-submit" disabled={deleting}>
              {t("confirmButton")}
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}
