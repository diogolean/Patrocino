"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { AccountRole, SessionRole } from "@mimelux/core";
import { getServerSessionSnapshot, getSessionSnapshot, refreshSession, subscribeSession } from "./session";

export function roleHome(role: SessionRole) {
  if (role === "admin") return "/admin";
  if (role === "creator") return "/painel";
  if (role === "affiliate") return "/afiliados";
  return "/topcreators?tab=top-creators";
}

export function useRoleGuard(required: AccountRole, alsoAllowed: readonly SessionRole[] = []) {
  const router = useRouter();
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);

  useEffect(() => {
    if (session.status === "loading") void refreshSession();
  }, [session.status]);

  useEffect(() => {
    if (session.status !== "ready") return;
    if (!session.user) {
      router.replace("/auth?route=sign-in");
      return;
    }
    if (session.user.role !== required && !alsoAllowed.includes(session.user.role)) router.replace(roleHome(session.user.role));
  }, [required, alsoAllowed, router, session]);

  const role = session.user?.role;
  return session.status === "ready" && Boolean(role) && (role === required || alsoAllowed.includes(role!));
}
