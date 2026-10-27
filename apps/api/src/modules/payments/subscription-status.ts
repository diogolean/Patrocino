/** ACTIVE is never written back to PENDING. Other statuses stay while the paid period is still open. */
export function resistsPending(
  subscription: { status: string; endsAt?: Date | null; currentPeriodEnd?: Date | null } | null | undefined,
  now = new Date(),
) {
  if (!subscription) return false;
  if (subscription.status === "ACTIVE") return true;
  const end = subscription.currentPeriodEnd ?? subscription.endsAt;
  if (!end || end.getTime() <= now.getTime()) return false;
  return subscription.status === "PAST_DUE" || subscription.status === "CANCELED";
}

export function laterInstant(current: Date | null | undefined, next: Date) {
  if (!current || Number.isNaN(current.getTime())) return next;
  return current.getTime() > next.getTime() ? current : next;
}
