"use client";

import { FormEvent, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { LoaderCircle, Shield } from "lucide-react";
import { Button, Logo } from "@mimelux/ui";
import { AccountIdentity } from "@/components/account-identity";
import { accountDisplayName } from "@/lib/account-label";
import { apiErrorText } from "@/lib/api-error";
import { getServerSessionSnapshot, getSessionSnapshot, refreshSession, subscribeSession } from "@/lib/session";
import { roleHome } from "@/lib/use-role-guard";
import { AdminCommerce } from "./commerce";
import { AdminCreatorStudio } from "./creator-studio";
import { AdminMedia } from "./media-library";
import { RevenueSettings } from "./revenue-settings";

type AdminRole = "FAN" | "CREATOR" | "AFFILIATE" | "ADMIN";

type AdminUser = {
  id: string;
  email: string;
  role: AdminRole;
  suspended: boolean;
  deleted: boolean;
  mustResetPassword: boolean;
  isDemo: boolean;
  createdAt: string;
  name: string;
  username: string;
  bio: string;
  city: string;
};

type AuditEntry = {
  id: string;
  action: string;
  createdAt: string;
};

type ErrorTranslator = { has: (key: string) => boolean; (key: string): string };

async function adminFetch<T>(path: string, errors: ErrorTranslator, fallback: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as T & { code?: unknown; message?: unknown };
  if (!response.ok) throw new Error(apiErrorText(data, errors, fallback));
  return data;
}

export default function AdminPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("admin");
  const nav = useTranslations("nav");
  const auth = useTranslations("auth");
  const errors = useTranslations("errors");
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);

  function roleLabel(role: AdminRole) {
    if (role === "FAN") return auth("fan");
    if (role === "CREATOR") return auth("creator");
    if (role === "AFFILIATE") return auth("affiliate");
    return t("roleAdmin");
  }
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<AdminUser | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState<{ id: string; value: string } | null>(null);

  useEffect(() => {
    if (session.status === "loading") void refreshSession();
  }, [session.status]);

  useEffect(() => {
    if (session.status !== "ready") return;
    if (!session.user) {
      router.replace("/auth?route=sign-in");
      return;
    }
    if (session.user.role !== "admin") router.replace(roleHome(session.user.role));
  }, [router, session]);

  const loadUsers = useCallback(async (nextQuery: string) => {
    setLoadingList(true);
    setError("");
    try {
      const data = await adminFetch<{ users: AdminUser[] }>(`/api/admin/users?q=${encodeURIComponent(nextQuery)}`, errors, t("listFailed"));
      setUsers(data.users);
      setSelectedId((current) => (data.users.some((user) => user.id === current) ? current : data.users[0]?.id ?? ""));
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : t("listFailed"));
    } finally {
      setLoadingList(false);
    }
  }, [errors, t]);

  useEffect(() => {
    if (session.status !== "ready" || session.user?.role !== "admin") return;
    const handle = window.setTimeout(() => {
      void loadUsers(query);
    }, 200);
    return () => window.clearTimeout(handle);
  }, [loadUsers, query, session.status, session.user?.role]);

  useEffect(() => {
    if (!selectedId || session.user?.role !== "admin") return;
    let cancelled = false;
    void adminFetch<{ user: AdminUser; audit: AuditEntry[] }>(`/api/admin/users/${selectedId}`, errors, t("openFailed"))
      .then((data) => {
        if (cancelled) return;
        setDraft(data.user);
        setAudit(data.audit);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error && caught.message ? caught.message : t("openFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [errors, selectedId, session.user?.role, t]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const data = await adminFetch<{ user: AdminUser }>(`/api/admin/users/${draft.id}`, errors, t("saveFailed"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: draft.role,
          name: draft.name,
          username: draft.username,
          bio: draft.bio,
          city: draft.city,
        }),
      });
      setDraft(data.user);
      setUsers((current) => current.map((user) => (user.id === data.user.id ? data.user : user)));
      setNotice(t("updated"));
      const fresh = await adminFetch<{ audit: AuditEntry[] }>(`/api/admin/users/${draft.id}`, errors, t("openFailed"));
      setAudit(fresh.audit);
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleSuspended() {
    if (!draft) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const data = await adminFetch<{ user: AdminUser }>(`/api/admin/users/${draft.id}`, errors, t("suspendFailed"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ suspended: !draft.suspended }),
      });
      setDraft(data.user);
      setUsers((current) => current.map((user) => (user.id === data.user.id ? data.user : user)));
      setNotice(data.user.suspended ? t("suspended") : t("reactivated"));
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : t("suspendFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword() {
    if (!draft) return;
    setSaving(true);
    setError("");
    setNotice("");
    setTemporaryPassword(null);
    try {
      const data = await adminFetch<{ temporaryPassword: string }>(`/api/admin/users/${draft.id}/reset-password`, errors, t("resetFailed"), {
        method: "POST",
      });
      setTemporaryPassword({ id: draft.id, value: data.temporaryPassword });
      setDraft({ ...draft, mustResetPassword: true });
      setNotice(t("tempNotice"));
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : t("resetFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function removeUser() {
    if (!draft) return;
    if (!window.confirm(t("deleteConfirm", { email: draft.email }))) return;
    setSaving(true);
    setError("");
    try {
      await adminFetch(`/api/admin/users/${draft.id}`, errors, t("deleteFailed"), { method: "DELETE" });
      setNotice(t("deleted"));
      setDraft(null);
      setSelectedId("");
      await loadUsers(query);
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : t("deleteFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (session.status !== "ready" || session.user?.role !== "admin") {
    return (
      <main className="grid min-h-dvh place-items-center bg-background text-sm text-muted">
        {t("opening")}
      </main>
    );
  }

  return (
    <main
      className="min-h-dvh bg-background"
      data-testid="session-user"
      data-email={session.user.email}
      data-role={session.user.role}
    >
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-4 sm:px-8">
        <Logo compact />
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/conta" data-testid="account-settings" aria-label={nav("accountLabel", { name: accountDisplayName(session.user) })} className="min-w-0">
            <AccountIdentity user={session.user} label={nav("account")} compact />
          </Link>
          <p className="hidden items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-primary-strong sm:flex">
            <Shield className="size-4" />
            {t("adminLabel")}
          </p>
        </div>
      </header>
      <RevenueSettings />
      <AdminCommerce />
      <AdminMedia />
      <AdminCreatorStudio />
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[320px_1fr] sm:px-8">
        <section className="rounded-3xl border border-border bg-elevated/70 p-4">
          <h1 className="text-lg font-extrabold tracking-[-.03em]">{t("accounts")}</h1>
          <p className="mt-1 text-xs leading-5 text-muted">{t("searchHint")}</p>
          <input
            data-testid="admin-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchLabel")}
            className="mt-4 h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-primary"
          />
          <div className="mt-4 space-y-2">
            {loadingList && <p className="text-sm text-muted">{t("loading")}</p>}
            {!loadingList && users.length === 0 && <p className="text-sm text-muted">{t("none")}</p>}
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                data-testid="admin-user"
                data-email={user.email}
                onClick={() => setSelectedId(user.id)}
                className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                  user.id === selectedId ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-surface"
                }`}
              >
                <p className="truncate text-sm font-bold">{user.name || user.email}</p>
                <p className="truncate text-xs text-muted">{user.email}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-primary-strong">
                  {roleLabel(user.role)}
                  {user.suspended ? t("suspendedMark") : ""}
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-elevated/70 p-4 sm:p-6">
          {!draft && <p className="text-sm text-muted">{t("select")}</p>}
          {draft && (
            <form onSubmit={save} className="space-y-4">
              <div>
                <h2 className="text-2xl font-extrabold tracking-[-.04em]">{draft.name || draft.email}</h2>
                <p className="mt-1 text-sm text-muted">{draft.email}</p>
              </div>
              <label className="block text-xs font-bold uppercase tracking-wide text-muted">
                {t("role")}
                <select
                  data-testid="admin-role"
                  value={draft.role}
                  onChange={(event) => setDraft({ ...draft, role: event.target.value as AdminRole })}
                  className="mt-2 h-11 w-full rounded-full border border-border bg-background px-4 text-sm font-semibold normal-case tracking-normal text-foreground"
                >
                  {(["FAN", "CREATOR", "AFFILIATE", "ADMIN"] as AdminRole[]).map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("name")} value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
                <Field label={t("username")} value={draft.username} onChange={(username) => setDraft({ ...draft, username })} />
                <Field label={t("city")} value={draft.city} onChange={(city) => setDraft({ ...draft, city })} />
                <Field label={t("bio")} value={draft.bio} onChange={(bio) => setDraft({ ...draft, bio })} />
              </div>
              <p className="text-xs text-muted">
                {draft.suspended ? t("statusSuspended") : t("statusActive")}
                {draft.mustResetPassword ? t("tempPending") : ""}
                {draft.isDemo ? t("demoAccount") : ""}
              </p>
              {error && (
                <p role="alert" className="rounded-2xl bg-accent/25 px-4 py-3 text-xs font-medium">
                  {error}
                </p>
              )}
              {notice && <p className="text-sm font-semibold text-primary-strong">{notice}</p>}
              {temporaryPassword?.id === draft.id && (
                <p data-testid="admin-temp-password" className="rounded-2xl border border-border bg-background px-4 py-3 text-sm">
                  {t("tempPassword")} <span className="font-bold">{temporaryPassword.value}</span>
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button data-testid="admin-save" type="submit" disabled={saving}>
                  {saving ? <LoaderCircle className="size-4 animate-spin" /> : null}
                  {t("save")}
                </Button>
                <Button data-testid="admin-suspend" type="button" variant="outline" disabled={saving} onClick={() => void toggleSuspended()}>
                  {draft.suspended ? t("reactivate") : t("suspend")}
                </Button>
                <Button data-testid="admin-reset" type="button" variant="outline" disabled={saving} onClick={() => void resetPassword()}>
                  {t("reset")}
                </Button>
                <Button data-testid="admin-delete" type="button" variant="ghost" disabled={saving} onClick={() => void removeUser()}>
                  {t("remove")}
                </Button>
              </div>
              <div>
                <h3 className="text-sm font-extrabold">{t("audit")}</h3>
                {audit.length === 0 && <p className="mt-2 text-xs text-muted">{t("noAudit")}</p>}
                <ul className="mt-2 space-y-2">
                  {audit.map((entry) => (
                    <li key={entry.id} className="rounded-2xl border border-border px-3 py-2 text-xs">
                      <span className="font-bold">{entry.action}</span>
                      <span className="text-muted"> · {new Date(entry.createdAt).toLocaleString(locale)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-xs font-bold uppercase tracking-wide text-muted">
      {label}
      <input
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-full border border-border bg-background px-4 text-sm font-medium normal-case tracking-normal text-foreground outline-none focus:border-primary"
      />
    </label>
  );
}
