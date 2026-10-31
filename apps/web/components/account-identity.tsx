import { accountDisplayName, accountInitial } from "@/lib/account-label";
import { CharacterSeal } from "@/components/character-card";

export function AccountIdentity({
  user,
  label,
  compact = false,
  iconOnly = false,
}: {
  user: { id?: string | null; name?: string | null; username?: string | null; email?: string | null; avatarUrl?: string | null };
  label: string;
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const display = accountDisplayName(user);
  const initial = accountInitial(display);
  return (
    <span className={`flex min-w-0 items-center ${compact ? "gap-2" : "gap-3"}`} title={display}>
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatarUrl} alt="" className={`${compact ? "size-8" : "size-10"} shrink-0 rounded-full object-cover`} />
      ) : (
        <CharacterSeal userId={user.id || user.email || user.username || "guest"} initial={initial} compact={compact} />
      )}
      {iconOnly ? <span className="sr-only">{display}. {label}</span> : <span className="min-w-0 text-left">
        <span data-testid="account-name" className={`block truncate font-extrabold ${compact ? "max-w-[7.5rem] text-xs sm:max-w-[14rem]" : "text-xs"}`}>
          {display}
        </span>
        {!compact && user.username?.trim() ? <span className="block truncate text-[10px] text-muted">@{user.username.trim()}</span> : null}
        <span className="sr-only">{label}</span>
      </span>}
    </span>
  );
}
