import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ImageIcon,
  Inbox,
  LockKeyhole,
  Search,
  Sparkles,
} from "lucide-react";
import { Button, Pill } from "./primitives";

const cx = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

export type NavigationItem = {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: string | number;
};

export function AppShell({
  navigation,
  header,
  children,
}: {
  navigation: ReactNode;
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      {navigation}
      {header}
      <main className="min-h-dvh pb-24 pt-16 lg:ml-[258px] lg:pb-8">
        {children}
      </main>
    </div>
  );
}

export function BottomNavigation({
  items,
  activeHref,
}: {
  items: NavigationItem[];
  activeHref: string;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid min-h-[72px] grid-flow-col border-t border-black/5 bg-background/90 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      {items.map((item) => {
        const active = activeHref.startsWith(item.href);
        return (
          <a
            key={item.href}
            href={item.href}
            className={cx(
              "relative flex min-h-11 flex-col items-center justify-center gap-1 text-[9px] font-bold transition",
              active ? "text-primary-strong" : "text-muted hover:text-foreground",
            )}
          >
            {active && <i className="absolute top-0 h-0.5 w-7 rounded-full bg-primary" />}
            {item.icon}
            {item.label}
            {item.badge && (
              <span className="absolute right-[24%] top-2 rounded-full bg-primary px-1.5 text-[8px] text-ink">
                {item.badge}
              </span>
            )}
          </a>
        );
      })}
    </nav>
  );
}

export function DesktopNavigation({
  brand,
  items,
  activeHref,
  footer,
}: {
  brand: ReactNode;
  items: NavigationItem[];
  activeHref: string;
  footer?: ReactNode;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[258px] flex-col border-r border-black/5 bg-background/95 p-6 backdrop-blur-xl lg:flex">
      {brand}
      <nav className="mt-10 space-y-1.5">
        {items.map((item) => {
          const active = activeHref.startsWith(item.href);
          return (
            <a
              key={item.href}
              href={item.href}
              className={cx(
                "flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-semibold transition",
                active
                  ? "bg-ink text-white shadow-lg dark:bg-primary dark:text-ink"
                  : "text-muted hover:bg-surface hover:text-foreground dark:hover:bg-white/10",
              )}
            >
              {item.icon}
              {item.label}
            </a>
          );
        })}
      </nav>
      {footer && <div className="mt-auto">{footer}</div>}
    </aside>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary-strong">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-2xl font-extrabold tracking-[-.04em] sm:text-3xl">
          {title}
        </h1>
        {description && <p className="mt-2 text-xs leading-5 text-muted">{description}</p>}
      </div>
      {actions}
    </header>
  );
}

export function PrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <Button {...props} variant="primary" />;
}

export type CreatorSummaryProps = {
  name: string;
  username: string;
  avatar: string;
  cover?: string;
  category?: string;
  verified?: boolean;
  fictitious?: boolean;
};

export function CreatorAvatar({
  src,
  alt,
  size = "md",
  active,
  className,
}: {
  src: string;
  alt: string;
  size?: "sm" | "md" | "lg" | "xl";
  active?: boolean;
  className?: string;
}) {
  const sizes = {
    sm: "size-10",
    md: "size-14",
    lg: "size-20 sm:size-24 lg:size-28",
    xl: "size-40 sm:size-44",
  };
  return (
    <span className={cx("relative z-20 inline-flex shrink-0 rounded-full", active && "bg-gradient-to-br from-primary to-accent p-0.5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={cx(
          sizes[size],
          "rounded-full border-4 border-elevated bg-elevated object-cover shadow-[0_14px_30px_rgba(12,13,20,.22)]",
        )}
      />
    </span>
  );
}

export function CreatorCard({
  creator,
  rank,
  action,
}: {
  creator: CreatorSummaryProps;
  rank?: number;
  action?: ReactNode;
}) {
  return (
    <article className="card-lift relative overflow-visible rounded-[30px] border border-border bg-elevated">
      {creator.cover && (
        <div className="relative z-0 h-40 overflow-hidden rounded-t-[30px] sm:h-48 lg:h-56">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={creator.cover} alt="" className="h-full w-full object-cover" />
          {rank && <b className="absolute right-4 top-3 text-3xl text-white">#{rank}</b>}
        </div>
      )}
      <div className="relative z-20 flex items-end gap-3 px-4 pb-4 sm:px-5">
        <CreatorAvatar src={creator.avatar} alt={creator.name} size="lg" className={creator.cover ? "-mt-10 sm:-mt-12 lg:-mt-14" : undefined} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-extrabold">{creator.name}</h3>
          <p className="truncate text-[9px] text-muted">@{creator.username}</p>
          {creator.fictitious && <p className="mt-1 text-[8px] text-primary-strong">Perfil fictício · IA</p>}
        </div>
        {action}
      </div>
    </article>
  );
}

export function CreatorProfileHeader({
  creator,
  bio,
  meta,
  actions,
}: {
  creator: CreatorSummaryProps;
  bio: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section>
      {creator.cover && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={creator.cover} alt="" className="relative z-0 h-56 w-full rounded-[28px] object-cover sm:h-72" />
      )}
      <div className="relative z-20 flex items-end justify-between gap-3 px-4">
        <CreatorAvatar src={creator.avatar} alt={creator.name} size="xl" className="-mt-16 sm:-mt-20" />
        {actions}
      </div>
      <div className="mt-4 px-4">
        <h1 className="text-2xl font-extrabold">{creator.name}</h1>
        <p className="text-xs text-muted">@{creator.username}</p>
        <p className="mt-4 max-w-2xl text-sm leading-6">{bio}</p>
        {meta && <div className="mt-4">{meta}</div>}
      </div>
    </section>
  );
}

export function SubscriptionPlanCard({
  name,
  price,
  description,
  highlighted,
  action,
}: {
  name: string;
  price: string;
  description: string;
  highlighted?: boolean;
  action: ReactNode;
}) {
  return (
    <article className={cx("rounded-[24px] border p-5", highlighted ? "border-primary/35 bg-primary/10" : "border-black/5 bg-white/60 dark:bg-white/5")}>
      {highlighted && <Pill active>Mais escolhido</Pill>}
      <h3 className="mt-3 text-sm font-extrabold">{name}</h3>
      <p className="mt-1 text-xl font-extrabold">{price}</p>
      <p className="mt-2 text-[10px] leading-5 text-muted">{description}</p>
      <div className="mt-5">{action}</div>
    </article>
  );
}

export function LockedMediaPlaceholder({
  title = "Conteúdo exclusivo",
  description,
  action,
}: {
  title?: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-black/10 p-5 text-center">
      <div className="max-w-xs rounded-[24px] bg-ink/55 p-4 text-white">
        <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-white/10"><LockKeyhole className="size-5" /></span>
        <h3 className="mt-3 text-sm font-extrabold">{title}</h3>
        <p className="mt-2 text-[10px] leading-5 text-white/65">{description}</p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

export function PostCard({ children, className }: { children: ReactNode; className?: string }) {
  return <article className={cx("overflow-hidden rounded-[26px] border border-black/5 bg-white/70 shadow-sm dark:bg-white/5", className)}>{children}</article>;
}

export function MediaGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>;
}

export function ChatPreview({
  avatar,
  name,
  message,
  time,
  unread,
}: {
  avatar: string;
  name: string;
  message: string;
  time: string;
  unread?: number;
}) {
  return (
    <div className="flex min-h-18 items-center gap-3 px-4 py-3">
      <CreatorAvatar src={avatar} alt={name} />
      <div className="min-w-0 flex-1">
        <div className="flex gap-2"><b className="truncate text-xs">{name}</b><span className="text-[8px] text-muted">{time}</span></div>
        <p className="mt-1 truncate text-[10px] text-muted">{message}</p>
      </div>
      {!!unread && <span className="grid size-6 place-items-center rounded-full bg-primary text-[9px] font-black text-ink">{unread}</span>}
    </div>
  );
}

export function SearchInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="relative block">
      <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input {...props} className={cx("h-[52px] w-full rounded-full border border-black/8 bg-white/70 pl-11 pr-4 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15 dark:bg-white/5", className)} />
    </label>
  );
}

export function CategoryTabs({
  items,
  active,
  onChange,
}: {
  items: readonly string[];
  active: string;
  onChange: (value: string) => void;
}) {
  return <div className="flex gap-2 overflow-x-auto pb-2">{items.map((item) => <button key={item} onClick={() => onChange(item)}><Pill active={active === item}>{item}</Pill></button>)}</div>;
}

export function SkeletonCard({ className }: { className?: string }) {
  return <div aria-hidden className={cx("skeleton h-72 rounded-[26px]", className)} />;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return <div className="grid place-items-center px-6 py-16 text-center"><span className="grid size-12 place-items-center rounded-2xl bg-surface"><Inbox className="size-5 text-muted" /></span><h3 className="mt-4 text-sm font-extrabold">{title}</h3><p className="mt-2 max-w-xs text-[10px] leading-5 text-muted">{description}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

export function ErrorState({
  title = "Algo não saiu como esperado",
  description,
  retry,
}: {
  title?: string;
  description: string;
  retry?: () => void;
}) {
  return <div className="grid place-items-center px-6 py-16 text-center"><AlertCircle className="size-8 text-accent-strong" /><h3 className="mt-4 text-sm font-extrabold">{title}</h3><p className="mt-2 max-w-xs text-[10px] text-muted">{description}</p>{retry && <Button className="mt-5" onClick={retry}>Tentar novamente</Button>}</div>;
}

export function OnboardingStep({
  eyebrow,
  title,
  description,
  icon = <Sparkles className="size-6" />,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return <section className="animate-enter text-center"><span className="mx-auto grid size-16 place-items-center rounded-[24px] bg-primary/20 text-primary-strong">{icon}</span><p className="mt-7 text-xs font-extrabold uppercase tracking-[.2em] text-primary-strong">{eyebrow}</p><h1 className="mx-auto mt-3 max-w-2xl text-3xl font-extrabold tracking-[-.05em] sm:text-5xl">{title}</h1><p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-muted">{description}</p>{children}</section>;
}

export function PremiumModal({
  open,
  title,
  description,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-ink/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="premium-modal-title"><div className="w-full max-w-md rounded-[30px] bg-background p-6 shadow-2xl"><span className="grid size-11 place-items-center rounded-2xl bg-primary/20 text-primary-strong"><Sparkles className="size-5" /></span><h2 id="premium-modal-title" className="mt-5 text-xl font-extrabold">{title}</h2>{description && <p className="mt-2 text-xs leading-5 text-muted">{description}</p>}<div className="mt-5">{children}</div><Button variant="ghost" className="mt-3 w-full" onClick={onClose}>Fechar</Button></div></div>;
}
