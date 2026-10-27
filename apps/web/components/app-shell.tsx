"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Compass,
  Database,
  CreditCard,
  House,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { Button, Logo, Mark } from "@mimelux/ui";
import type { SessionRole } from "@mimelux/core";
import { LanguageSwitcher } from "@/components/language-switcher";
import { MessageAlerts } from "@/components/message-alerts";
import { ThemeToggle } from "@/components/theme-toggle";
import { readDemo, writeDemo } from "@/lib/demo-store";
import { getServerUnreadSnapshot, getUnreadSnapshot, subscribeUnread, unreadBadge } from "@/lib/unread-store";
import { getServerSessionSnapshot, getSessionSnapshot, logoutAccount, refreshSession, subscribeSession } from "@/lib/session";
import { creators } from "@/lib/gateway";

const items = [
  { href: "/feed", label: "feed", icon: House },
  { href: "/topcreators?tab=top-creators", match: "/topcreators", label: "trending", icon: TrendingUp },
  { href: "/chat", label: "chat", icon: MessageCircle },
  { href: "/busca", label: "search", icon: Search },
  { href: "/assinaturas", label: "billing", icon: CreditCard },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("nav");
  const tNotifications = useTranslations("notifications");
  const unread = useSyncExternalStore(subscribeUnread, getUnreadSnapshot, getServerUnreadSnapshot).count;
  const currentCreator = creators[0]!;
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);
  const role: SessionRole = session.user?.role ?? "fan";
  const [demoMode, setDemoMode] = useState(true);
  const showDemoBadge = process.env.NODE_ENV !== "production";
  const [collapsed, setCollapsed] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.localStorage.getItem("mimelux-sidebar-collapsed") === "true",
  );
  function setSidebar(next: boolean) {
    setCollapsed(next);
    window.localStorage.setItem("mimelux-sidebar-collapsed", String(next));
  }
  useEffect(() => {
    const sync = () => setDemoMode(readDemo().demoMode);
    sync();
    void refreshSession();
    window.addEventListener("mimelux:state", sync);
    return () => window.removeEventListener("mimelux:state", sync);
  }, []);
  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 40) setSidebar(true);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const areaHref = role === "admin" ? "/admin" : role === "affiliate" ? "/afiliados" : "/painel";

  return (
    <div className="min-h-dvh" data-testid="session-user" data-email={session.user?.email ?? ""} data-role={role}>
      <MessageAlerts />
      <aside
        data-collapsed={collapsed}
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-background/92 backdrop-blur-xl transition-[width,padding] duration-300 lg:flex ${
          collapsed ? "w-[84px] p-4" : "w-[258px] p-6"
        }`}
      >
        <div className="flex items-center justify-between">
          {collapsed ? (
            <span className="grid size-10 place-items-center rounded-[14px] bg-foreground text-background">
              <Mark className="size-6" />
            </span>
          ) : (
            <Logo compact />
          )}
          <button
            type="button"
            aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
            onClick={() => setSidebar(!collapsed)}
            className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-surface hover:text-foreground"
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
        </div>
        <nav className="mt-10 space-y-1.5">
          {items.map((item) => {
            const active = pathname.startsWith("match" in item ? item.match : item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebar(true)}
                title={collapsed ? t(item.label) : undefined}
                aria-label={item.label === "chat" && unread > 0 ? `${t("chat")}, ${tNotifications("unread", { count: unread })}` : undefined}
                className={`relative flex h-12 items-center rounded-2xl text-sm font-semibold transition ${
                  collapsed ? "justify-center px-0" : "gap-3 px-4"
                } ${
                  active
                    ? "bg-ink text-white shadow-lg dark:bg-primary dark:text-ink"
                    : "text-muted hover:bg-surface hover:text-foreground dark:hover:bg-white/8"
                }`}
              >
                <Icon className="size-[18px]" strokeWidth={active ? 2.5 : 1.8} />
                {!collapsed && t(item.label)}
                {item.label === "chat" && unread > 0 && (
                  <span
                    data-testid="unread-badge"
                    className={
                      collapsed
                        ? "absolute right-1.5 top-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[8px] font-black leading-4 text-ink"
                        : "ml-auto grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[9px] font-black leading-5 text-ink"
                    }
                  >
                    {unreadBadge(unread)}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {!collapsed && <div className="mt-8 rounded-[24px] bg-gradient-to-br from-primary/25 to-accent/25 p-4">
          <div className="grid size-9 place-items-center rounded-xl bg-primary">
            <Compass className="size-4 text-ink" />
          </div>
          <p className="mt-4 text-sm font-extrabold">{role === "affiliate" ? t("promote") : t("create")}</p>
          <p className="mt-1 text-[10px] leading-5 text-muted">{role === "affiliate" ? t("promoteBody") : t("createBody")}</p>
          <Link href={areaHref} className="mt-3 inline-block text-[11px] font-bold text-primary-strong">{role === "affiliate" ? t("openAffiliates") : t("openStudio")}</Link>
        </div>}

        <div className={`mt-auto flex items-center rounded-2xl p-2 ${collapsed ? "justify-center" : "gap-3"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={currentCreator.avatar} alt={currentCreator.name} className="size-10 rounded-full object-cover" />
          {!collapsed && <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-extrabold">{currentCreator.name}</p>
            <p className="truncate text-[10px] text-muted">@{currentCreator.username}</p>
          </div>}
          <button
            aria-label={t("logout")}
            onClick={() => {
              void logoutAccount().then(() => router.push("/auth?route=sign-in"));
            }}
            className="grid size-9 place-items-center rounded-full text-muted hover:bg-black/5"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      <header className={`glass fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between px-4 transition-[left] duration-300 lg:px-8 ${
        collapsed ? "lg:left-[84px]" : "lg:left-[258px]"
      }`}>
        <div className="lg:hidden"><Logo compact /></div>
        <div className="hidden lg:block">
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-muted">Patrocino</p>
          <p className="text-xs font-extrabold">{t("space")}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {showDemoBadge && (
            <button
              type="button"
              data-testid="mode-toggle"
              onClick={() => writeDemo({ demoMode: !demoMode })}
              className="hidden h-9 items-center gap-2 rounded-full border border-border px-3 text-[9px] font-black uppercase tracking-[.12em] text-muted transition hover:bg-surface sm:flex"
              title="Alternar dados fictícios"
            >
              <Database className="size-3.5" /> {demoMode ? "Demo" : "Real"}
            </button>
          )}
          <ThemeToggle label={t("theme")} />
          <div className="hidden sm:block">
            <LanguageSwitcher compact />
          </div>
          <Button variant="ghost" size="icon" aria-label={t("notifications")} className="relative">
            <Bell className="size-[18px]" />
            <i className="absolute right-2.5 top-2.5 size-2 rounded-full border-2 border-background bg-primary" />
          </Button>
          {session.status === "ready" && !session.user ? (
            <>
              <Link href="/auth?route=sign-in">
                <Button size="sm" variant="outline" className="h-9 px-3">Entrar</Button>
              </Link>
              <Link href="/auth?route=sign-up" className="hidden sm:inline-flex">
                <Button size="sm" className="h-9 px-3">Cadastre-se</Button>
              </Link>
            </>
          ) : (
            <>
              <Link href="/conta" data-testid="account-settings" className="px-2 text-[11px] font-bold text-muted hover:text-foreground">
                {t("account")}
              </Link>
              <Link href={areaHref}>
                <Button variant="ghost" size="icon" aria-label={t("profile")}>
                  <UserRound className="size-[18px]" />
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("logout")}
                className="lg:hidden"
                onClick={() => {
                  void logoutAccount().then(() => router.push("/auth?route=sign-in"));
                }}
              >
                <LogOut className="size-[18px]" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" aria-label="Menu" className="lg:hidden">
            <Menu className="size-[18px]" />
          </Button>
        </div>
      </header>

      <main className={`min-h-dvh pb-24 pt-16 transition-[margin] duration-300 lg:pb-8 ${
        collapsed ? "lg:ml-[84px]" : "lg:ml-[258px]"
      }`}>
        {showDemoBadge && !demoMode ? (
          <div className="grid min-h-[calc(100dvh-64px)] place-items-center px-5 text-center">
            <div className="max-w-md rounded-[32px] border border-border bg-elevated p-8 shadow-xl">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent/15 text-accent-strong"><Database className="size-6" /></span>
              <p className="mt-5 text-[10px] font-black uppercase tracking-[.18em] text-primary-strong">Modo real</p>
              <h1 className="mt-2 text-2xl font-extrabold">Pronto para conteúdo real</h1>
              <p className="mt-3 text-xs leading-6 text-muted">Os registros fictícios estão isolados e ocultos. Conecte uma conta real quando a operação estiver pronta.</p>
              <Button className="mt-6" onClick={() => writeDemo({ demoMode: true })}>Voltar ao modo demo</Button>
            </div>
          </div>
        ) : children}
      </main>

      <nav className="glass fixed inset-x-0 bottom-0 z-40 grid h-[72px] grid-cols-4 px-2 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {items.map((item) => {
          const active = pathname.startsWith("match" in item ? item.match : item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label === "chat" && unread > 0 ? `${t("chat")}, ${tNotifications("unread", { count: unread })}` : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 text-[9px] font-bold transition ${
                active ? "text-primary-strong" : "text-muted"
              }`}
            >
              {active && <i className="absolute top-0 h-0.5 w-7 rounded-full bg-primary" />}
              <Icon className="size-5" strokeWidth={active ? 2.5 : 1.8} />
              {t(item.label)}
              {item.label === "chat" && unread > 0 && (
                <span className="absolute right-[18%] top-2 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[8px] font-black leading-4 text-ink">
                  {unreadBadge(unread)}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
