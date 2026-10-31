import type { AccountRole, SessionRole } from "@mimelux/core";
import { upstreamAuthHeaders } from "./client-ip";

export type SessionUser = {
  id: string;
  email: string;
  role: SessionRole;
  emailVerified: boolean;
  name: string;
  username: string;
  avatarUrl: string | null;
};

type ApiUser = {
  id: string;
  email: string;
  role: string;
  emailVerified?: boolean;
  name?: string;
  username?: string;
  avatarUrl?: string | null;
};

export function apiBase() {
  return (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3334/v1").replace(/\/$/, "");
}

export function toAccountRole(role: string): SessionRole {
  const value = role.toLowerCase();
  if (value === "creator") return "creator";
  if (value === "affiliate") return "affiliate";
  if (value === "admin") return "admin";
  return "fan";
}

export function toApiRole(role: AccountRole) {
  if (role === "creator") return "CREATOR";
  if (role === "affiliate") return "AFFILIATE";
  return "FAN";
}

export function toSessionUser(user: ApiUser): SessionUser {
  return {
    id: user.id,
    email: user.email,
    role: toAccountRole(user.role),
    emailVerified: Boolean(user.emailVerified),
    name: user.name ?? "",
    username: user.username ?? "",
    avatarUrl: user.avatarUrl ?? null,
  };
}

export async function apiAuth(path: string, body: unknown, request?: Request) {
  const response = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...upstreamAuthHeaders(request) },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
    code?: string;
    user?: ApiUser;
    accessToken?: string;
    refreshToken?: string;
  };
  return { response, data };
}

export function authErrorMessage(status: number, fallback: string) {
  if (status === 401) return "E-mail ou senha inválidos.";
  if (status === 409) return "Esse e-mail já tem uma conta.";
  if (status === 429) return "Muitas tentativas. Espere um instante.";
  return fallback;
}
