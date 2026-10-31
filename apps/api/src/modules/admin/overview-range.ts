import { DAY_MS, startOfSaoPauloDay, type Money } from "./overview-math";

export const RANGE_PRESETS = ["today", "7d", "30d", "month", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export type OverviewRange = {
  preset: RangePreset;
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  bucket: "hour" | "day";
};

const SP_OFFSET_MS = 3 * 3_600_000;
const MAX_DAYS = 366;
const isoDay = /^\d{4}-\d{2}-\d{2}$/;

/** Midnight in São Paulo for a YYYY-MM-DD date, or null when malformed. */
export function saoPauloDate(value: string | undefined) {
  if (!value || !isoDay.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(time) ? null : new Date(time + SP_OFFSET_MS);
}

/** Turns query params into a concrete window plus the equally long window right before it. */
export function resolveRange(input: { range?: string; from?: string; to?: string }, now: Date): OverviewRange {
  const preset: RangePreset = RANGE_PRESETS.includes(input.range as RangePreset) ? (input.range as RangePreset) : "30d";
  const today = startOfSaoPauloDay(now);
  let from: Date;
  let to = now;
  if (preset === "today") from = today;
  else if (preset === "7d") from = new Date(today.getTime() - 6 * DAY_MS);
  else if (preset === "month") {
    const local = new Date(today.getTime() - SP_OFFSET_MS);
    from = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + SP_OFFSET_MS);
  } else if (preset === "custom") {
    const start = saoPauloDate(input.from) ?? new Date(today.getTime() - 29 * DAY_MS);
    const end = saoPauloDate(input.to) ?? today;
    const [lo, hi] = start <= end ? [start, end] : [end, start];
    from = new Date(Math.max(lo.getTime(), hi.getTime() - (MAX_DAYS - 1) * DAY_MS));
    to = new Date(Math.min(hi.getTime() + DAY_MS, now.getTime()));
    if (to <= from) to = new Date(from.getTime() + DAY_MS);
  } else from = new Date(today.getTime() - 29 * DAY_MS);
  const span = to.getTime() - from.getTime();
  return {
    preset,
    from,
    to,
    prevFrom: new Date(from.getTime() - span),
    prevTo: from,
    bucket: span <= DAY_MS ? "hour" : "day",
  };
}

/** Bucket start times covering [from, to); days are São Paulo midnights. */
export function bucketStarts(range: Pick<OverviewRange, "from" | "to" | "bucket">) {
  const step = range.bucket === "hour" ? 3_600_000 : DAY_MS;
  const start = range.bucket === "hour" ? range.from.getTime() : startOfSaoPauloDay(range.from).getTime();
  const out: Date[] = [];
  for (let time = start; time < range.to.getTime(); time += step) out.push(new Date(time));
  return out;
}

export function bucketIndex(at: Date, from: Date, bucket: OverviewRange["bucket"]) {
  const step = bucket === "hour" ? 3_600_000 : DAY_MS;
  const start = bucket === "hour" ? from.getTime() : startOfSaoPauloDay(from).getTime();
  return Math.floor((at.getTime() - start) / step);
}

/** Percent change, or null when there is nothing to compare against. */
export function percentDelta(current: number, previous: number) {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Main currency of a pair of money totals: BRL first, else the largest one present. */
export function mainCurrency(...values: Money[]) {
  const keys = new Set(values.flatMap((money) => Object.keys(money)));
  if (keys.has("BRL") || keys.size === 0) return "BRL";
  return [...keys].sort()[0]!;
}
