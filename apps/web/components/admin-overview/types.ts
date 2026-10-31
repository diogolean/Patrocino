export type Money = Record<string, number>;
export type MoneyKpi = { current: Money; previous: Money; currency: string; delta: number | null };
export type CountKpi = { current: number; previous: number; delta: number | null };
export type RangePreset = "today" | "7d" | "30d" | "month" | "custom";
export type RangeQuery = { preset: RangePreset; from?: string; to?: string };

export type Overview = {
  generatedAt: string;
  range: { preset: RangePreset; from: string; to: string; prevFrom: string; bucket: "hour" | "day" };
  kpis: { revenue: MoneyKpi; mrr: MoneyKpi; sales: CountKpi; conversion: CountKpi };
  series: { t: string; revenue: Money; prevRevenue: Money; sales: number }[];
  byProvider: Record<string, Money>;
  byType: Record<string, { count: number; amount: Money }>;
  subscriptions: { active: CountKpi; created: CountKpi; churned: CountKpi };
  funnel: { visits: number | null; clicks: CountKpi; signups: CountKpi; attributedSignups: number; buyers: number; conversion: CountKpi; clickToSignup: number };
  topCreators: { id: string; name: string; username: string; revenue: Money; sales: number; activeSubs: number; videos: number; photos: number }[];
  affiliates: { id: string; name: string; clicks: number; sales: number; pending: Money; paid: Money }[];
  health: { pixPending: { count: number; amount: Money }; pixFailed: number; purchasesFailed: number; purchasesStuck: number; refunded: number };
};
