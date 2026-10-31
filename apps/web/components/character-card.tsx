"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { accountDisplayName, accountInitial } from "@/lib/account-label";
import {
  characterVariation,
  type CardEmblem,
  type CardPattern,
  type CharacterVariation,
} from "@/lib/character-card";
import { refreshSession } from "@/lib/session";

type Labels = {
  classTitle: string;
  addPhoto: string;
  changePhoto: string;
  hint: string;
  invalid: string;
  large: string;
  failed: string;
  saved: string;
  busy: string;
};

export function CharacterSeal({
  userId,
  initial,
  compact = false,
}: {
  userId: string;
  initial: string;
  compact?: boolean;
}) {
  const variation = characterVariation(userId);
  const size = compact ? 32 : 40;
  return (
    <span
      data-testid="account-initial"
      data-frame={variation.frame.id}
      data-emblem={variation.emblem}
      data-pattern={variation.pattern}
      aria-hidden
      className={`grid shrink-0 place-items-center ${compact ? "size-8" : "size-10"}`}
    >
      <svg viewBox="0 0 40 40" width={size} height={size} role="img">
        <title>{initial}</title>
        <defs>
          <linearGradient id={`seal-metal-${variation.hash}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={variation.frame.highlight} />
            <stop offset="0.45" stopColor={variation.frame.frame} />
            <stop offset="1" stopColor={variation.frame.edge} />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r="18" fill={`url(#seal-metal-${variation.hash})`} />
        <circle cx="20" cy="20" r="14.5" fill={variation.ground.from} stroke={variation.frame.edge} strokeWidth="1" />
        <g transform="translate(8 8)" fill={variation.frame.ink}>
          <Emblem kind={variation.emblem} ink={variation.frame.ink} />
        </g>
      </svg>
    </span>
  );
}

export function AccountCharacterCard({
  user,
  variant = "sheet",
  profileHref,
}: {
  user: { id: string; name?: string | null; username?: string | null; email?: string | null; avatarUrl?: string | null };
  variant?: "sheet" | "banner";
  profileHref?: string;
}) {
  const t = useTranslations("account");
  const name = accountDisplayName(user);
  const titles = [t("class0"), t("class1"), t("class2"), t("class3"), t("class4"), t("class5")];
  return (
    <CharacterCard
      userId={user.id}
      name={name}
      initial={accountInitial(name)}
      avatarUrl={user.avatarUrl}
      variant={variant}
      profileHref={profileHref}
      labels={{
        classTitle: titles[characterVariation(user.id).titleIndex] ?? t("class0"),
        addPhoto: t("addPhoto"),
        changePhoto: t("changePhoto"),
        hint: t("photoHint"),
        invalid: t("photoInvalid"),
        large: t("photoLarge"),
        failed: t("photoFailed"),
        saved: t("photoSaved"),
        busy: t("photoBusy"),
      }}
    />
  );
}

export function CharacterCard({
  userId,
  name,
  initial,
  avatarUrl,
  labels,
  variant = "sheet",
  profileHref,
}: {
  userId: string;
  name: string;
  initial: string;
  avatarUrl?: string | null;
  labels: Labels;
  variant?: "sheet" | "banner";
  profileHref?: string;
}) {
  const variation = characterVariation(userId);
  const uid = useId().replace(/:/g, "");
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState(avatarUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const shown = photo || avatarUrl || "";
  const sheet = variant === "sheet";

  async function onFile(file: File | undefined) {
    setError("");
    setSaved(false);
    if (!file) return;
    const named = /\.(jpe?g|png|webp)$/i.test(file.name);
    const typed = file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp";
    if (file.type ? !typed : !named) {
      setError(labels.invalid);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError(labels.large);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/account/avatar", {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: await file.arrayBuffer(),
      });
      const data = (await response.json().catch(() => ({}))) as { code?: string; user?: { avatarUrl?: string | null } };
      if (!response.ok) {
        setError(data.code === "AVATAR_TOO_LARGE" ? labels.large : data.code === "AVATAR_INVALID" ? labels.invalid : labels.failed);
        return;
      }
      if (data.user?.avatarUrl) setPhoto(data.user.avatarUrl);
      setSaved(true);
      await refreshSession();
    } catch {
      setError(labels.failed);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className={sheet ? "mx-auto w-full max-w-[17.5rem]" : "w-full"} data-testid={sheet ? "character-card" : "character-card-banner"}>
      <div
        className="relative"
        data-frame={variation.frame.id}
        data-emblem={variation.emblem}
        data-pattern={variation.pattern}
        data-ground={variation.ground.id}
        data-title-index={variation.titleIndex}
      >
        {sheet ? <SheetFace uid={uid} variation={variation} name={name} classTitle={labels.classTitle} /> : <BannerFace uid={uid} variation={variation} name={name} classTitle={labels.classTitle} />}
        {profileHref ? (
          <Link href={profileHref} className="absolute left-[4%] top-[16%] z-[1] h-[68%] w-[58%] rounded-xl" aria-label={name}>
            <span className="sr-only">{name}</span>
          </Link>
        ) : null}
        <button
          type="button"
          data-testid="avatar-portrait"
          disabled={busy}
          aria-label={shown ? labels.changePhoto : labels.addPhoto}
          onClick={() => fileRef.current?.click()}
          className={`absolute z-[2] overflow-hidden rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-70 ${
            sheet ? "left-[22.1%] top-[19.5%] h-[47%] w-[55.7%]" : "left-[71.25%] top-[16.7%] h-[66.7%] w-[23.75%]"
          }`}
          style={{ outlineColor: variation.frame.edge }}
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full flex-col items-center justify-center" style={{ color: variation.frame.ink }}>
              <span className={`font-serif font-semibold leading-none ${sheet ? "text-4xl" : "text-lg"}`}>{initial}</span>
            </span>
          )}
          <span
            className={`absolute inset-x-0.5 bottom-0.5 rounded-md px-0.5 py-1 text-center font-bold leading-tight shadow-sm ${sheet ? "text-[11px]" : "text-[8px]"}`}
            style={{ background: variation.frame.frame, color: variation.frame.ink }}
          >
            {busy ? labels.busy : shown ? labels.changePhoto : labels.addPhoto}
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          className="sr-only"
          data-testid={sheet ? "avatar-file" : undefined}
          aria-label={labels.addPhoto}
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
      </div>
      {sheet ? <p className="mt-2 text-center text-[11px] leading-5 text-muted">{labels.hint}</p> : null}
      {error ? (
        <p role="alert" className="mt-2 text-center text-xs font-semibold text-accent-strong">
          {error}
        </p>
      ) : null}
      {saved && !error ? (
        <p role="status" className="mt-2 text-center text-xs font-semibold" style={{ color: variation.frame.edge }}>
          {labels.saved}
        </p>
      ) : null}
    </div>
  );
}

function SheetFace({
  uid,
  variation,
  name,
  classTitle,
}: {
  uid: string;
  variation: CharacterVariation;
  name: string;
  classTitle: string;
}) {
  const plate = name.length > 22 ? `${name.slice(0, 21)}…` : name;
  return (
    <svg viewBox="0 0 280 400" className="h-auto w-full drop-shadow-md" role="img" aria-hidden>
      <CardDefs uid={uid} variation={variation} />
      <rect x="8" y="8" width="264" height="384" rx="22" fill={`url(#metal-${uid})`} />
      <rect x="16" y="16" width="248" height="368" rx="16" fill={`url(#ground-${uid})`} />
      <rect x="16" y="16" width="248" height="368" rx="16" fill={`url(#pattern-${uid})`} opacity="0.45" />
      <rect x="16" y="16" width="248" height="368" rx="16" filter={`url(#grain-${uid})`} opacity="0.55" />
      <rect x="22" y="22" width="236" height="356" rx="12" fill="none" stroke={variation.frame.highlight} strokeOpacity="0.65" />
      <rect x="62" y="78" width="156" height="188" rx="10" fill="#f7f1e4" stroke={variation.frame.edge} strokeWidth="1.5" strokeDasharray="4 3" />
      <circle cx="140" cy="64" r="26" fill={`url(#metal-${uid})`} />
      <circle cx="140" cy="64" r="21" fill={variation.ground.from} stroke={variation.frame.edge} />
      <g transform="translate(124 48)" fill={variation.frame.ink}>
        <Emblem kind={variation.emblem} ink={variation.frame.ink} />
      </g>
      <Corners ink={variation.frame.edge} />
      <text x="140" y="300" textAnchor="middle" fill={variation.frame.edge} fontSize="11" fontWeight="700" letterSpacing="2.4">
        {classTitle.toUpperCase()}
      </text>
      <text data-testid="account-name" x="140" y="326" textAnchor="middle" fill={variation.frame.ink} fontSize="16" fontWeight="800">
        {plate}
      </text>
      <title>{name}</title>
    </svg>
  );
}

function BannerFace({
  uid,
  variation,
  name,
  classTitle,
}: {
  uid: string;
  variation: CharacterVariation;
  name: string;
  classTitle: string;
}) {
  const plate = name.length > 16 ? `${name.slice(0, 15)}…` : name;
  return (
    <svg viewBox="0 0 320 108" className="h-auto w-full" role="img" aria-hidden>
      <CardDefs uid={uid} variation={variation} />
      <rect x="3" y="3" width="314" height="102" rx="18" fill={`url(#metal-${uid})`} />
      <rect x="8" y="8" width="304" height="92" rx="14" fill={`url(#ground-${uid})`} />
      <rect x="8" y="8" width="304" height="92" rx="14" fill={`url(#pattern-${uid})`} opacity="0.4" />
      <rect x="8" y="8" width="304" height="92" rx="14" filter={`url(#grain-${uid})`} opacity="0.5" />
      <circle cx="40" cy="54" r="24" fill={`url(#metal-${uid})`} />
      <circle cx="40" cy="54" r="19" fill={variation.ground.from} stroke={variation.frame.edge} />
      <g transform="translate(24 38)" fill={variation.frame.ink}>
        <Emblem kind={variation.emblem} ink={variation.frame.ink} />
      </g>
      <rect x="228" y="18" width="76" height="72" rx="8" fill="#f7f1e4" stroke={variation.frame.edge} strokeDasharray="3 2" />
      <text x="74" y="46" fill={variation.frame.edge} fontSize="9" fontWeight="700" letterSpacing="1.6">
        {classTitle.toUpperCase()}
      </text>
      <text x="74" y="68" fill={variation.frame.ink} fontSize="13" fontWeight="800">
        {plate}
      </text>
      <title>{name}</title>
    </svg>
  );
}

function CardDefs({ uid, variation }: { uid: string; variation: CharacterVariation }) {
  return (
    <defs>
      <linearGradient id={`metal-${uid}`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={variation.frame.highlight} />
        <stop offset="0.28" stopColor={variation.frame.frame} />
        <stop offset="0.72" stopColor={variation.frame.edge} />
        <stop offset="1" stopColor={variation.frame.frame} />
      </linearGradient>
      <linearGradient id={`ground-${uid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={variation.ground.from} />
        <stop offset="1" stopColor={variation.ground.to} />
      </linearGradient>
      <pattern id={`pattern-${uid}`} width="16" height="16" patternUnits="userSpaceOnUse">
        <Pattern kind={variation.pattern} ink={variation.frame.ink} />
      </pattern>
      <filter id={`grain-${uid}`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={variation.hash % 8} />
        <feColorMatrix type="saturate" values="0" />
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.22" />
        </feComponentTransfer>
      </filter>
    </defs>
  );
}

function Pattern({ kind, ink }: { kind: CardPattern; ink: string }) {
  const stroke = ink;
  if (kind === "chevron") {
    return <path d="M0 12 L8 4 L16 12" fill="none" stroke={stroke} strokeOpacity="0.28" strokeWidth="1" />;
  }
  if (kind === "scale") {
    return <path d="M8 1 Q15 8 8 15 Q1 8 8 1" fill="none" stroke={stroke} strokeOpacity="0.28" />;
  }
  if (kind === "cross") {
    return <path d="M8 2 V14 M2 8 H14" stroke={stroke} strokeOpacity="0.28" />;
  }
  return <path d="M8 1 L15 8 L8 15 L1 8 Z" fill="none" stroke={stroke} strokeOpacity="0.28" />;
}

function Emblem({ kind, ink }: { kind: CardEmblem; ink: string }) {
  if (kind === "sword") {
    return (
      <g>
        <path d="M14 2 H18 V20 H22 V24 H10 V20 H14 Z" />
        <path d="M8 8 H24 V12 H8 Z" />
      </g>
    );
  }
  if (kind === "star") {
    return <path d="M16 2 L19.2 11 H29 L21 16.4 L24 26 L16 20.6 L8 26 L11 16.4 L3 11 H12.8 Z" />;
  }
  if (kind === "sun") {
    return (
      <g>
        <circle cx="16" cy="16" r="5" />
        <path d="M16 3 V7 M16 25 V29 M3 16 H7 M25 16 H29 M6.5 6.5 L9.2 9.2 M22.8 22.8 L25.5 25.5 M25.5 6.5 L22.8 9.2 M9.2 22.8 L6.5 25.5" stroke={ink} strokeWidth="2" />
      </g>
    );
  }
  if (kind === "moon") {
    return <path d="M20 4 A12 12 0 1 0 20 28 A9 9 0 1 1 20 4 Z" />;
  }
  if (kind === "key") {
    return (
      <g>
        <circle cx="11" cy="14" r="6" fill="none" stroke={ink} strokeWidth="3" />
        <path d="M16 14 H29 V18 H25 V14" fill="none" stroke={ink} strokeWidth="3" />
      </g>
    );
  }
  return <path d="M16 2 L26 7 V15 C26 22 16 28 16 28 C16 28 6 22 6 15 V7 Z" />;
}

function Corners({ ink }: { ink: string }) {
  const diamond = "M0 0 L5 5 L0 10 L-5 5 Z";
  return (
    <g fill={ink}>
      <g transform="translate(36 36)"><path d={diamond} /></g>
      <g transform="translate(244 36)"><path d={diamond} /></g>
      <g transform="translate(36 364)"><path d={diamond} /></g>
      <g transform="translate(244 364)"><path d={diamond} /></g>
    </g>
  );
}
