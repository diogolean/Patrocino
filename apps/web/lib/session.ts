"use client";

import type { AccountRole } from "@mimelux/core";
import type { SessionUser } from "./api-auth";
import { apiErrorText } from "./api-error";

export type { SessionUser };

type SessionSnapshot = {
  status: "loading" | "ready";
  user: SessionUser | null;
};

const serverSnapshot: SessionSnapshot = { status: "loading", user: null };
let snapshot: SessionSnapshot = serverSnapshot;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
  if (typeof window !== "undefined") window.dispatchEvent(new Event("mimelux:state"));
}

export function subscribeSession(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getSessionSnapshot() {
  return snapshot;
}

export function getServerSessionSnapshot() {
  return serverSnapshot;
}

function setSnapshot(next: SessionSnapshot) {
  snapshot = next;
  emit();
}

export class SessionRequestError extends Error {
  readonly code?: string;
  readonly apiMessage?: unknown;

  constructor(code?: string, apiMessage?: unknown) {
    super(typeof apiMessage === "string" ? apiMessage : "");
    this.name = "SessionRequestError";
    this.code = code;
    this.apiMessage = apiMessage;
  }
}

export function sessionErrorText(
  caught: unknown,
  errors: { has: (key: string) => boolean; (key: string): string },
  fallback: string,
) {
  if (caught instanceof SessionRequestError) {
    return apiErrorText({ code: caught.code, message: caught.apiMessage }, errors, fallback);
  }
  return fallback;
}

async function readUser(response: Response) {
  const data = (await response.json().catch(() => ({}))) as { user?: SessionUser | null; message?: unknown; code?: unknown };
  if (!response.ok) {
    throw new SessionRequestError(typeof data.code === "string" ? data.code : undefined, data.message);
  }
  setSnapshot({ status: "ready", user: data.user ?? null });
  return data.user ?? null;
}

let refreshInflight: Promise<SessionUser | null> | null = null;

export async function refreshSession() {
  if (refreshInflight) return refreshInflight;
  refreshInflight = (async () => {
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      return await readUser(response);
    } catch {
      setSnapshot({ status: "ready", user: snapshot.user });
      return snapshot.user;
    } finally {
      refreshInflight = null;
    }
  })();
  return refreshInflight;
}

export async function loginAccount(email: string, password: string) {
  const response = await fetch("/api/session/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const user = await readUser(response);
  if (!user) throw new SessionRequestError();
  return user;
}

export async function registerAccount(input: {
  name: string;
  email: string;
  password: string;
  role: AccountRole;
  acceptTerms: true;
  acceptCreatorTerms?: boolean;
  locale?: string;
}) {
  const response = await fetch("/api/session/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const user = await readUser(response);
  if (!user) throw new SessionRequestError();
  return user;
}

export async function socialAccount(
  provider: string,
  role: AccountRole,
  acceptance: { acceptTerms: true; acceptCreatorTerms?: boolean },
) {
  const response = await fetch("/api/session/social", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider, role, ...acceptance }),
  });
  const user = await readUser(response);
  if (!user) throw new SessionRequestError();
  return user;
}

export async function logoutAccount() {
  await fetch("/api/session/logout", { method: "POST" });
  setSnapshot({ status: "ready", user: null });
}
