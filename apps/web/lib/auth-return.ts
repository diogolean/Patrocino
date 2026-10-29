import { safeReturnPath } from "@mimelux/core";

export { safeReturnPath };

export function authHref(route: "sign-in" | "sign-up", next: string | null | undefined) {
  const safe = safeReturnPath(next);
  const query = new URLSearchParams({ route });
  if (safe) query.set("next", safe);
  return `/auth?${query.toString()}`;
}

export function postSignUpPath(next: string | null | undefined) {
  const safe = safeReturnPath(next);
  return safe ? `/verificacao?next=${encodeURIComponent(safe)}` : "/verificacao";
}

/** Where email verification lands. A confirmed address with a safe next goes straight back. */
export function verificationLanding(ok: boolean, next: string | null | undefined) {
  const safe = safeReturnPath(next);
  if (ok && safe) return safe;
  const params = new URLSearchParams({ route: "sign-in", verified: ok ? "1" : "0" });
  if (safe) params.set("next", safe);
  return `/auth?${params.toString()}`;
}
