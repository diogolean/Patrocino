import type { ReactNode } from "react";

/** Shared look: dark glass cards with a hairline border, consistent with the site's dark theme. */
export function Panel({ title, subtitle, action, children, testId, className = "" }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; testId?: string; className?: string }) {
  return (
    <section data-testid={testId} className={`rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5 ${className}`}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-white/[0.06] ${className}`} />;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
      <div aria-hidden className="mb-2 grid size-9 place-items-center rounded-full bg-white/[0.05] text-muted">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></svg>
      </div>
      <p className="text-sm font-medium text-foreground/90">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function DeltaBadge({ delta, unit = "%", label, newLabel }: { delta: number | null; unit?: string; label: string; newLabel: string }) {
  if (delta === null) return <span className="shrink-0 rounded-md bg-sky-400/10 px-1.5 py-0.5 text-[11px] font-medium text-sky-300" title={label}>{newLabel}</span>;
  const tone = delta > 0 ? "bg-emerald-400/10 text-emerald-300" : delta < 0 ? "bg-rose-400/10 text-rose-300" : "bg-white/[0.06] text-muted";
  const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
  return (
    <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`} title={label} aria-label={`${label}: ${delta > 0 ? "+" : ""}${delta}${unit}`}>
      {arrow} {Math.abs(delta)}
      {unit}
    </span>
  );
}

export function MiniStat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" | "bad" }) {
  const toneClass = tone === "bad" ? "text-rose-300" : tone === "warn" ? "text-amber-300" : "text-foreground";
  return (
    <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06] transition-colors md:hover:bg-white/[0.05]">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums tracking-[-0.02em] ${toneClass}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
