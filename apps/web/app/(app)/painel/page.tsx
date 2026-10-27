"use client";

import { ChangeEvent, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Eye,
  FileImage,
  ImagePlus,
  MessagesSquare,
  Plus,
  Tag,
  Users,
  Wallet,
} from "lucide-react";
import { Button, Pill } from "@mimelux/ui";
import { brl, creators, dashboardMetrics, posts } from "@/lib/gateway";
import { readDemo, writeDemo } from "@/lib/demo-store";
import { useRoleGuard } from "@/lib/use-role-guard";
import { ChatSequenceEditor } from "@/components/chat-sequence-editor";
import { CreatorStudio } from "@/components/creator-studio";
import { MediaManager } from "@/components/media-manager";
import { toast } from "sonner";

const requestStatusKey = {
  requested: "statusRequested",
  quoted: "statusQuoted",
  accepted: "statusAccepted",
  paid: "statusPaid",
  delivered: "statusDelivered",
  declined: "statusDeclined",
  refunded: "statusRefunded",
} as const;

export default function DashboardPage() {
  const allowed = useRoleGuard("creator");
  const creator = creators.find((item) => item.username === "lunaferraz") ?? creators[0]!;
  const inputRef = useRef<HTMLInputElement>(null);
  const locale = useLocale();
  const t = useTranslations("studio");
  const programCopy = useTranslations("creatorProgram");
  const [uploadName, setUploadName] = useState("");
  const [acceptsAffiliates, setAcceptsAffiliates] = useState(() => readDemo().creatorProgram.acceptsAffiliates);
  const [commission, setCommission] = useState(() => readDemo().creatorProgram.commissionBps / 100);
  const [monetization, setMonetization] = useState(() => readDemo().creatorMonetization);
  const [requests, setRequests] = useState(() => readDemo().specialRequests);
  const max = Math.max(...dashboardMetrics.monthlySeries);

  if (!allowed) return <div className="m-6 h-[70vh] rounded-[30px] skeleton" />;

  function selectUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadName(file.name);
    toast.info(t("fileReady"));
  }

  function publishDemo() {
    if (!uploadName) {
      inputRef.current?.click();
      return;
    }
    toast.success(t("publishedQueued"));
    setUploadName("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function saveMonetization() {
    writeDemo({ creatorMonetization: monetization });
    toast.success(t("pricesSaved"));
  }

  function updateRequest(id: string, status: "quoted" | "declined" | "delivered") {
    const next = requests.map((request) =>
      request.id === id
        ? {
            ...request,
            status,
            quotedPriceCents:
              status === "quoted" ? request.quotedPriceCents || 15_000 : request.quotedPriceCents,
          }
        : request,
    );
    setRequests(next);
    writeDemo({ specialRequests: next });
    toast.success(t("requestUpdated"));
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 lg:py-9">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Pill>{t("creatorDemo")}</Pill>
            <Pill>{t("fictitious")}</Pill>
          </div>
          <h1 className="mt-3 text-2xl font-extrabold tracking-[-.04em]">{t("studioTitle")}</h1>
          <p className="mt-2 text-xs text-muted">{t("studioBody")}</p>
        </div>
        <div className="flex gap-2">
          <input ref={inputRef} data-testid="demo-upload" type="file" accept="image/*,video/*" className="hidden" onChange={selectUpload} />
          <Button variant="outline" onClick={() => inputRef.current?.click()}><ImagePlus className="size-4" /> {t("uploadMedia")}</Button>
          <Button onClick={publishDemo}><Plus className="size-4" /> {uploadName ? t("publishDemo") : t("newPost")}</Button>
        </div>
      </header>

      {uploadName && (
        <div className="mt-5 flex items-center gap-3 rounded-[22px] border border-primary/25 bg-primary/10 p-4">
          <span className="grid size-10 place-items-center rounded-2xl bg-primary/20"><FileImage className="size-4 text-primary-strong" /></span>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold">{uploadName}</p><p className="text-[9px] text-muted">{t("localPreview")}</p></div>
          <button onClick={() => setUploadName("")} className="text-[10px] font-bold text-muted">{t("remove")}</button>
        </div>
      )}

      <div className="mt-6">
        <MediaManager />
      </div>

      <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: t("revenue"), value: brl(dashboardMetrics.revenueCents), detail: t("revenueDetail"), icon: Wallet },
          { label: t("subscribers"), value: dashboardMetrics.subscribers.toLocaleString(locale), detail: t("newSubscribers", { count: dashboardMetrics.newSubscribers.toLocaleString(locale) }), icon: Users },
          { label: t("views"), value: t("viewsValue"), detail: t("viewsDetail"), icon: Eye },
          { label: t("engagement"), value: `${dashboardMetrics.engagementRate}%`, detail: t("engagementDetail"), icon: BarChart3 },
        ].map(({ label, value, detail, icon: Icon }) => (
          <article key={label} className="card-lift rounded-[24px] border border-black/5 bg-white/65 p-5 dark:bg-white/5">
            <div className="flex items-start justify-between"><span className="grid size-10 place-items-center rounded-2xl bg-surface dark:bg-white/10"><Icon className="size-4 text-primary-strong" /></span><ArrowUpRight className="size-4 text-emerald-600" /></div>
            <p className="mt-5 text-[9px] font-semibold text-muted">{label}</p>
            <p className="mt-1 text-xl font-extrabold tracking-[-.04em]">{value}</p>
            <p className="mt-2 text-[9px] text-muted">{detail}</p>
          </article>
        ))}
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.45fr_.75fr]">
        <section className="rounded-[28px] border border-black/5 bg-white/65 p-5 dark:bg-white/5 sm:p-6">
          <div className="flex items-center justify-between">
            <div><h2 className="text-sm font-extrabold">{t("growth")}</h2><p className="mt-1 text-[9px] text-muted">{t("growthBody")}</p></div>
            <Pill active>{t("subscribers")}</Pill>
          </div>
          <div className="mt-8 flex h-48 items-end gap-2 sm:gap-3">
            {dashboardMetrics.monthlySeries.map((value, index) => (
              <div key={index} className="group flex h-full flex-1 items-end">
                <div style={{ height: `${Math.round((value / max) * 100)}%` }} className="relative w-full rounded-t-lg bg-gradient-to-t from-primary to-accent transition hover:brightness-105">
                  <span className="absolute -top-6 left-1/2 hidden -translate-x-1/2 text-[8px] font-bold group-hover:block">{value}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[8px] text-muted"><span>{t("monthNov")}</span><span>{t("monthFeb")}</span><span>{t("monthMay")}</span><span>{t("monthAug")}</span><span>{t("monthOct")}</span></div>
        </section>

        <section className="rounded-[28px] bg-ink p-6 text-white">
          <span className="grid size-11 place-items-center rounded-2xl bg-white/10"><Wallet className="size-5 text-primary" /></span>
          <p className="mt-6 text-[9px] font-semibold text-white/55">{t("balance")}</p>
          <h2 className="mt-1 text-3xl font-extrabold tracking-[-.05em]">{brl(dashboardMetrics.availableCents)}</h2>
          <p className="mt-2 text-[9px] leading-4 text-white/45">{t("noRealBalance")}</p>
          <Button className="mt-6 w-full" onClick={() => toast.success(t("pixWithdrawToast"))}><ArrowDownToLine className="size-4" /> {t("pixWithdraw")}</Button>
        </section>
      </div>

      <section className="mt-5 rounded-[28px] border border-black/5 bg-white/65 p-5 dark:bg-white/5 sm:p-6">
        <div className="flex items-center justify-between"><div><h2 className="text-sm font-extrabold">{t("recent")}</h2><p className="mt-1 text-[9px] text-muted">{t("recentBody")}</p></div><a href={`/creator/${creator.username}`} className="text-[10px] font-bold text-primary-strong">{t("seeAll")}</a></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {posts.filter((post) => post.creatorId === creator.id).slice(0, 3).map((post) => (
            <article key={post.id} className="flex items-center gap-3 rounded-[20px] bg-surface/55 p-3 dark:bg-white/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.image} alt="" className="size-14 rounded-2xl object-cover" />
              <div className="min-w-0 flex-1"><p className="line-clamp-2 text-[9px] font-bold leading-4">{post.caption}</p><p className="mt-1 text-[8px] text-muted">{t("interactions", { count: post.likes.toLocaleString(locale) })}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-5 rounded-[28px] border border-black/5 bg-white/65 p-5 dark:bg-white/5 sm:p-6">
        <h2 className="text-sm font-extrabold">{t("sequenceTitle")}</h2>
        <p className="mt-1 max-w-2xl text-[10px] leading-5 text-muted">{t("sequenceBody")}</p>
        <ChatSequenceEditor />
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-[28px] border border-black/5 bg-white/65 p-5 dark:bg-white/5 sm:p-6">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-primary/15"><Tag className="size-4 text-primary-strong" /></span><div><h2 className="text-sm font-extrabold">{t("offersTitle")}</h2><p className="text-[9px] text-muted">{t("offersBody")}</p></div></div>
          <div className="mt-5">
            <CreatorStudio />
          </div>
          <div className="mt-5 rounded-[22px] bg-surface/60 p-4 dark:bg-white/5">
            <label className="flex items-center justify-between text-xs font-bold">{t("promoActive")} <input type="checkbox" checked={monetization.promotion.active} onChange={(event) => setMonetization({ ...monetization, promotion: { ...monetization.promotion, active: event.target.checked } })} /></label>
            <label className="mt-4 block text-[10px] font-bold text-muted">{t("promoDiscount", { percent: monetization.promotion.discountPercent })}
              <input type="range" min={5} max={80} value={monetization.promotion.discountPercent} onChange={(event) => setMonetization({ ...monetization, promotion: { ...monetization.promotion, discountPercent: Number(event.target.value) } })} className="mt-2 w-full accent-primary" />
            </label>
            <p className="mt-3 text-[9px] text-muted">{t("promoNote")}</p>
          </div>
          <Button className="mt-5 w-full" onClick={saveMonetization}>{t("saveMonetization")}</Button>
        </div>

        <div className="rounded-[28px] border border-black/5 bg-white/65 p-5 dark:bg-white/5 sm:p-6">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-accent/15"><MessagesSquare className="size-4 text-accent-strong" /></span><div><h2 className="text-sm font-extrabold">{t("requests")}</h2><p className="text-[9px] text-muted">{t("requestsBody")}</p></div></div>
          <div className="mt-5 space-y-3">
            {requests.length === 0 ? (
              <div className="rounded-[22px] bg-surface/60 px-5 py-10 text-center dark:bg-white/5"><p className="text-xs font-extrabold">{t("noRequests")}</p><p className="mt-1 text-[9px] text-muted">{t("requestsEmpty")}</p></div>
            ) : requests.map((request) => (
              <article key={request.id} data-testid="special-request-card" className="rounded-[22px] bg-surface/60 p-4 dark:bg-white/5">
                <div className="flex items-start justify-between gap-3"><p className="text-[10px] font-bold leading-5">{request.description}</p><Pill>{request.status in requestStatusKey ? t(requestStatusKey[request.status]) : request.status}</Pill></div>
                <p className="mt-2 text-[9px] text-muted">{request.budgetCents ? t("budget", { price: brl(request.budgetCents) }) : t("noBudget")}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {request.status === "requested" && <><Button size="sm" onClick={() => updateRequest(request.id, "quoted")}>{t("counter")}</Button><Button size="sm" variant="outline" onClick={() => updateRequest(request.id, "declined")}>{t("decline")}</Button></>}
                  {request.status === "paid" && <Button size="sm" onClick={() => updateRequest(request.id, "delivered")}>{t("delivered")}</Button>}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-[28px] border border-black/5 bg-white/65 p-5 dark:bg-white/5 sm:p-6">
        <h2 className="text-sm font-extrabold">{programCopy("title")}</h2>
        <p className="mt-2 max-w-xl text-[10px] leading-5 text-muted">{programCopy("body")}</p>
        <label className="mt-5 flex items-center gap-3 text-xs font-bold">
          <input type="checkbox" checked={acceptsAffiliates} onChange={(event) => setAcceptsAffiliates(event.target.checked)} />
          {programCopy("accept")}
        </label>
        <label className="mt-4 block text-[10px] font-bold text-muted">
          {programCopy("rate")}: {commission}%
          <input type="range" min={5} max={50} value={commission} onChange={(event) => setCommission(Number(event.target.value))} className="mt-2 w-full accent-primary" />
        </label>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {([
            ["commissionOnPpv", "commissionPpv"],
            ["commissionOnPacks", "commissionPacks"],
            ["commissionOnRequests", "commissionRequests"],
          ] as const).map(([field, label]) => (
            <label key={field} className="flex items-center gap-2 rounded-2xl bg-surface/60 p-3 text-[9px] font-bold dark:bg-white/5">
              <input type="checkbox" checked={monetization[field]} onChange={(event) => setMonetization({ ...monetization, [field]: event.target.checked })} />
              {t(label)}
            </label>
          ))}
        </div>
        <Button className="mt-5" onClick={() => {
          writeDemo({ creatorProgram: { acceptsAffiliates, commissionBps: commission * 100 }, creatorMonetization: monetization });
          toast.success(programCopy("saved"));
        }}>{programCopy("save")}</Button>
      </section>
    </div>
  );
}
