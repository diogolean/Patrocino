import { DeltaBadge } from "./primitives";
import { Sparkline } from "./sparkline";

export function KpiCard({ label, value, delta, deltaUnit, deltaLabel, sub, spark, testId }: { label: string; value: string; delta: number | null; deltaUnit?: string; deltaLabel: string; sub?: string; spark?: number[]; testId?: string }) {
  return (
    <div data-testid={testId} className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-4 transition-[border-color,transform] duration-200 md:hover:-translate-y-0.5 md:hover:border-primary/40">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-primary/10 opacity-0 blur-2xl transition-opacity duration-300 md:group-hover:opacity-100" />
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted">{label}</p>
        <DeltaBadge delta={delta} unit={deltaUnit} label={deltaLabel} />
      </div>
      <p className="mt-2 truncate text-[22px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-foreground sm:text-2xl">{value}</p>
      {sub && <p className="mt-1.5 truncate text-[11px] text-muted">{sub}</p>}
      {spark && spark.length > 1 && <div className="mt-2 -mb-1"><Sparkline values={spark} id={testId ?? label} /></div>}
    </div>
  );
}
