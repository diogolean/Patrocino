"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { saoPauloToday } from "./format";
import type { RangePreset, RangeQuery } from "./types";

const PRESETS: RangePreset[] = ["today", "7d", "30d", "month", "custom"];

/** Segmented preset control; "custom" opens two native date inputs (best picker on Android Chrome). */
export function RangePicker({ value, onChange, busy }: { value: RangeQuery; onChange: (next: RangeQuery) => void; busy: boolean }) {
  const t = useTranslations("adminOverview.range");
  const today = saoPauloToday();
  const [from, setFrom] = useState(value.from ?? today.slice(0, 8) + "01");
  const [to, setTo] = useState(value.to ?? today);
  const applyCustom = () => from && to && onChange({ preset: "custom", from, to });

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <div role="radiogroup" aria-label={t("label")} className="grid grid-cols-5 gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/[0.08]" data-testid="range-picker">
        {PRESETS.map((preset) => {
          const active = value.preset === preset;
          return (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => (preset === "custom" ? onChange({ preset, from, to }) : onChange({ preset }))}
              className={`min-h-10 touch-manipulation select-none rounded-lg px-2.5 text-xs font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.96] sm:px-3.5 ${
                active ? "bg-white text-[#0c0d14] shadow-sm" : "text-muted active:bg-white/10 md:hover:bg-white/[0.06] md:hover:text-foreground"
              }`}
            >
              {t(preset)}
            </button>
          );
        })}
      </div>
      {value.preset === "custom" && (
        <div className="flex items-end gap-2" data-testid="range-custom">
          <label className="flex flex-1 flex-col gap-1 text-[11px] text-muted">
            {t("from")}
            <input type="date" value={from} max={to || today} onChange={(event) => setFrom(event.target.value)} className="min-h-10 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-sm text-foreground [color-scheme:dark]" />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-[11px] text-muted">
            {t("to")}
            <input type="date" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)} className="min-h-10 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-sm text-foreground [color-scheme:dark]" />
          </label>
          <button type="button" onClick={applyCustom} disabled={busy} className="min-h-10 touch-manipulation rounded-lg bg-primary px-4 text-xs font-bold text-[#0c0d14] transition active:scale-[0.96] disabled:opacity-60 md:hover:brightness-110">
            {t("apply")}
          </button>
        </div>
      )}
    </div>
  );
}
