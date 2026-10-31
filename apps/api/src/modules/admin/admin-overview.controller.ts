import { apiError } from "../../http/api-error";
import { Controller, Get, Headers, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { requireUser } from "../auth/require-user";
import { resolveRange } from "./overview-range";
import { loadAffiliates, loadFunnel, loadHealth, loadSales, loadSubscriptions, loadTopCreators } from "./overview.service";

@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin")
export class AdminOverviewController {
  /** Executive dashboard. `range` = today | 7d | 30d | month | custom (+ `from`/`to` as YYYY-MM-DD, São Paulo dates). */
  @Get("overview")
  async overview(
    @Headers("authorization") authorization: string | undefined,
    @Query("range") rangeParam?: string,
    @Query("from") fromParam?: string,
    @Query("to") toParam?: string,
  ) {
    const user = await requireUser(authorization);
    if (user.role !== "ADMIN") throw apiError(403, "ADMIN_ONLY", "Admin only");
    const now = new Date();
    const range = resolveRange({ range: rangeParam, from: fromParam, to: toParam }, now);
    const [sales, subscriptions, affiliates, health] = await Promise.all([loadSales(range), loadSubscriptions(range), loadAffiliates(range), loadHealth(range, now)]);
    const [funnel, topCreators] = await Promise.all([loadFunnel(range, sales.buyers), loadTopCreators(sales.paid)]);
    return {
      generatedAt: now.toISOString(),
      range: { preset: range.preset, from: range.from.toISOString(), to: range.to.toISOString(), prevFrom: range.prevFrom.toISOString(), bucket: range.bucket },
      kpis: { revenue: sales.revenue, mrr: subscriptions.mrr, sales: sales.sales, conversion: funnel.conversion },
      series: sales.series,
      byProvider: sales.byProvider,
      byType: sales.byType,
      subscriptions: { active: subscriptions.active, created: subscriptions.created, churned: subscriptions.churned },
      funnel,
      topCreators,
      affiliates,
      health,
    };
  }
}
