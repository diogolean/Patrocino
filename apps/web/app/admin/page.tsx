"use client";

import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Shield } from "lucide-react";
import { Button, Logo } from "@mimelux/ui";
import { getServerSessionSnapshot, getSessionSnapshot, refreshSession, subscribeSession } from "@/lib/session";
import { roleHome } from "@/lib/use-role-guard";
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

const roleLabel: Record<AdminRole, string> = {
  FAN: "Fã",
  CREATOR: "Criador",
  AFFILIATE: "Afiliado",
  ADMIN: "Admin",
};

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Error(data.message || "Não foi possível concluir a ação.");
  return data;
}

export default function AdminPage() {
  const router = useRouter();
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);
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

  useEffect(() => {
    if (session.status !== "ready" || session.user?.role !== "admin") return;
    const handle = window.setTimeout(() => {
      void loadUsers(query);
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query, session.status, session.user?.role]);

  async function loadUsers(nextQuery: string) {
    setLoadingList(true);
    setError("");
    try {
      const data = await adminFetch<{ users: AdminUser[] }>(`/api/admin/users?q=${encodeURIComponent(nextQuery)}`);
      setUsers(data.users);
      setSelectedId((current) => (data.users.some((user) => user.id === current) ? current : data.users[0]?.id ?? ""));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível listar as contas.");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    if (!selectedId || session.user?.role !== "admin") return;
    let cancelled = false;
    void adminFetch<{ user: AdminUser; audit: AuditEntry[] }>(`/api/admin/users/${selectedId}`)
      .then((data) => {
        if (cancelled) return;
        setDraft(data.user);
        setAudit(data.audit);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Não foi possível abrir a conta.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, session.user?.role]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const data = await adminFetch<{ user: AdminUser }>(`/api/admin/users/${draft.id}`, {
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
      setNotice("Conta atualizada.");
      const fresh = await adminFetch<{ audit: AuditEntry[] }>(`/api/admin/users/${draft.id}`);
      setAudit(fresh.audit);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.");
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
      const data = await adminFetch<{ user: AdminUser }>(`/api/admin/users/${draft.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ suspended: !draft.suspended }),
      });
      setDraft(data.user);
      setUsers((current) => current.map((user) => (user.id === data.user.id ? data.user : user)));
      setNotice(data.user.suspended ? "Conta suspensa." : "Conta reativada.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível alterar a suspensão.");
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
      const data = await adminFetch<{ temporaryPassword: string }>(`/api/admin/users/${draft.id}/reset-password`, {
        method: "POST",
      });
      setTemporaryPassword({ id: draft.id, value: data.temporaryPassword });
      setDraft({ ...draft, mustResetPassword: true });
      setNotice("Senha temporária gerada. Ela aparece só desta vez.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível redefinir a senha.");
    } finally {
      setSaving(false);
    }
  }

  async function removeUser() {
    if (!draft) return;
    if (!window.confirm(`Excluir a conta de ${draft.email}? O acesso acaba agora.`)) return;
    setSaving(true);
    setError("");
    try {
      await adminFetch(`/api/admin/users/${draft.id}`, { method: "DELETE" });
      setNotice("Conta excluída.");
      setDraft(null);
      setSelectedId("");
      await loadUsers(query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível excluir a conta.");
    } finally {
      setSaving(false);
    }
  }

  if (session.status !== "ready" || session.user?.role !== "admin") {
    return (
      <main className="grid min-h-dvh place-items-center bg-background text-sm text-muted">
        Abrindo a administração…
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
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-primary-strong">
          <Shield className="size-4" />
          Administração
        </p>
      </header>
      <RevenueSettings />
      <AdminMedia />
      <AdminCreatorStudio />
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[320px_1fr] sm:px-8">
        <section className="rounded-3xl border border-border bg-elevated/70 p-4">
          <h1 className="text-lg font-extrabold tracking-[-.03em]">Contas</h1>
          <p className="mt-1 text-xs leading-5 text-muted">Busque por e-mail, nome ou usuário.</p>
          <input
            data-testid="admin-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar conta"
            aria-label="Buscar conta"
            className="mt-4 h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-primary"
          />
          <div className="mt-4 space-y-2">
            {loadingList && <p className="text-sm text-muted">Carregando contas…</p>}
            {!loadingList && users.length === 0 && <p className="text-sm text-muted">Nenhuma conta encontrada.</p>}
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
                  {roleLabel[user.role]}
                  {user.suspended ? " · suspensa" : ""}
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-elevated/70 p-4 sm:p-6">
          {!draft && <p className="text-sm text-muted">Selecione uma conta para ver os detalhes.</p>}
          {draft && (
            <form onSubmit={save} className="space-y-4">
              <div>
                <h2 className="text-2xl font-extrabold tracking-[-.04em]">{draft.name || draft.email}</h2>
                <p className="mt-1 text-sm text-muted">{draft.email}</p>
              </div>
              <label className="block text-xs font-bold uppercase tracking-wide text-muted">
                Papel
                <select
                  data-testid="admin-role"
                  value={draft.role}
                  onChange={(event) => setDraft({ ...draft, role: event.target.value as AdminRole })}
                  className="mt-2 h-11 w-full rounded-full border border-border bg-background px-4 text-sm font-semibold normal-case tracking-normal text-foreground"
                >
                  {(Object.keys(roleLabel) as AdminRole[]).map((role) => (
                    <option key={role} value={role}>
                      {roleLabel[role]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nome" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
                <Field label="Usuário" value={draft.username} onChange={(username) => setDraft({ ...draft, username })} />
                <Field label="Cidade" value={draft.city} onChange={(city) => setDraft({ ...draft, city })} />
                <Field label="Bio" value={draft.bio} onChange={(bio) => setDraft({ ...draft, bio })} />
              </div>
              <p className="text-xs text-muted">
                {draft.suspended ? "Suspensa" : "Ativa"}
                {draft.mustResetPassword ? " · senha temporária pendente" : ""}
                {draft.isDemo ? " · conta de demonstração" : ""}
              </p>
              {error && (
                <p role="alert" className="rounded-2xl bg-accent/25 px-4 py-3 text-xs font-medium">
                  {error}
                </p>
              )}
              {notice && <p className="text-sm font-semibold text-primary-strong">{notice}</p>}
              {temporaryPassword?.id === draft.id && (
                <p data-testid="admin-temp-password" className="rounded-2xl border border-border bg-background px-4 py-3 text-sm">
                  Senha temporária: <span className="font-bold">{temporaryPassword.value}</span>
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button data-testid="admin-save" type="submit" disabled={saving}>
                  {saving ? <LoaderCircle className="size-4 animate-spin" /> : null}
                  Salvar
                </Button>
                <Button data-testid="admin-suspend" type="button" variant="outline" disabled={saving} onClick={() => void toggleSuspended()}>
                  {draft.suspended ? "Reativar" : "Suspender"}
                </Button>
                <Button data-testid="admin-reset" type="button" variant="outline" disabled={saving} onClick={() => void resetPassword()}>
                  Redefinir senha
                </Button>
                <Button data-testid="admin-delete" type="button" variant="ghost" disabled={saving} onClick={() => void removeUser()}>
                  Excluir
                </Button>
              </div>
              <div>
                <h3 className="text-sm font-extrabold">Auditoria</h3>
                {audit.length === 0 && <p className="mt-2 text-xs text-muted">Nenhuma ação registrada nesta conta.</p>}
                <ul className="mt-2 space-y-2">
                  {audit.map((entry) => (
                    <li key={entry.id} className="rounded-2xl border border-border px-3 py-2 text-xs">
                      <span className="font-bold">{entry.action}</span>
                      <span className="text-muted"> · {new Date(entry.createdAt).toLocaleString("pt-BR")}</span>
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
