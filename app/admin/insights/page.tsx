// app/admin/insights/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import RoleGuard from "@/components/RoleGuard";
import AppShell from "@/components/AppShell";
import { CatalogueItem, OrderItem, ItemCategory } from "@/lib/types";
import { fetchCatalogue } from "@/lib/data/catalogueApi";
import {
  getCycleInfo,
  fetchDepartmentOrder,
  baseMonth,
  monthLabel,
} from "@/lib/data/orderApi";
import { indexCatalogue } from "@/lib/orderSummary";

const DEPT = "endo";
const MONTHS_BACK = 6;

export default function AdminInsightsPage() {
  return (
    <RoleGuard allow="admin">
      <AppShell>
        <Insights />
      </AppShell>
    </RoleGuard>
  );
}

/** The N months BEFORE the given month (exclusive), oldest first. */
function monthsBefore(month: string, n: number): string[] {
  const [y, m] = month.split("-").map(Number);
  const out: string[] = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Short label for chart axes: "2026-07" → "Jul 26". */
function shortLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en", { month: "short", year: "2-digit" });
}

interface MonthAgg {
  month: string;
  ordered: number;
  dispatched: number;
  anyDispatch: boolean;
  emergencies: number;
  gapByCategory: Record<ItemCategory, number>;
}

interface ItemShortage {
  item: CatalogueItem | undefined;
  catalogueItemId: string;
  monthsShort: number;
  totalGap: number;
}

const CATEGORY_KEYS: ItemCategory[] = ["Consumable", "Reusable Instrument", "Capital Equipment"];

function Insights() {
  const [monthAggs, setMonthAggs] = useState<MonthAgg[]>([]);
  const [shortages, setShortages] = useState<ItemShortage[]>([]);
  const [monthsAnalyzed, setMonthsAnalyzed] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [info, catalogue] = await Promise.all([getCycleInfo(DEPT), fetchCatalogue(DEPT)]);
      const byId = indexCatalogue(catalogue);

      // Closed base months = the N months before the current open cycle.
      const baseMonths = monthsBefore(info.currentMonth, MONTHS_BACK);

      // Every cycle id per base month: the plain month + its emergencies.
      const cyclesByMonth = new Map<string, string[]>();
      for (const m of baseMonths) {
        const ems = info.emergencies.filter((e) => baseMonth(e.id) === m).map((e) => e.id);
        cyclesByMonth.set(m, [m, ...ems]);
      }

      // Fetch all cycles in parallel.
      const allCycleIds = [...cyclesByMonth.values()].flat();
      const results = await Promise.all(
        allCycleIds.map((c) => fetchDepartmentOrder(c, DEPT))
      );
      const itemsByCycle = new Map<string, OrderItem[]>();
      allCycleIds.forEach((c, i) => itemsByCycle.set(c, results[i]));

      // Aggregate per month (emergencies folded into their base month).
      const aggs: MonthAgg[] = [];
      const shortageMap = new Map<string, ItemShortage>();

      for (const m of baseMonths) {
        const agg: MonthAgg = {
          month: m,
          ordered: 0,
          dispatched: 0,
          anyDispatch: false,
          emergencies: (cyclesByMonth.get(m)?.length ?? 1) - 1,
          gapByCategory: {
            Consumable: 0,
            "Reusable Instrument": 0,
            "Capital Equipment": 0,
          },
        };

        // Per-item totals within this month, to compute item-level gaps.
        const perItem = new Map<string, { ordered: number; dispatched: number; any: boolean }>();

        for (const cycleId of cyclesByMonth.get(m) ?? []) {
          for (const o of itemsByCycle.get(cycleId) ?? []) {
            if (o.status !== "closed") continue; // only closed data counts as history
            agg.ordered += o.quantity;
            const d = typeof o.dispatchedQuantity === "number" ? o.dispatchedQuantity : null;
            if (d !== null) {
              agg.dispatched += d;
              agg.anyDispatch = true;
            }
            let pi = perItem.get(o.catalogueItemId);
            if (!pi) {
              pi = { ordered: 0, dispatched: 0, any: false };
              perItem.set(o.catalogueItemId, pi);
            }
            pi.ordered += o.quantity;
            if (d !== null) {
              pi.dispatched += d;
              pi.any = true;
            }
          }
        }

        // Item-level gaps → category gaps + top-shortage tracking.
        for (const [itemId, pi] of perItem) {
          if (!pi.any) continue; // no dispatch data = no verifiable gap
          const gap = pi.ordered - pi.dispatched;
          if (gap <= 0) continue;
          const item = byId.get(itemId);
          const cat = item?.category ?? "Consumable";
          agg.gapByCategory[cat] += gap;

          let s = shortageMap.get(itemId);
          if (!s) {
            s = { item, catalogueItemId: itemId, monthsShort: 0, totalGap: 0 };
            shortageMap.set(itemId, s);
          }
          s.monthsShort += 1;
          s.totalGap += gap;
        }

        aggs.push(agg);
      }

      const withData = aggs.filter((a) => a.ordered > 0);
      setMonthAggs(aggs);
      setMonthsAnalyzed(withData.length);
      setShortages(
        [...shortageMap.values()].sort(
          (a, b) => b.monthsShort - a.monthsShort || b.totalGap - a.totalGap
        )
      );
      setLoading(false);
    })();
  }, []);

  const headline = useMemo(() => {
    const withDispatch = monthAggs.filter((a) => a.anyDispatch && a.ordered > 0);
    const totalOrdered = withDispatch.reduce((s, a) => s + a.ordered, 0);
    const totalDispatched = withDispatch.reduce((s, a) => s + a.dispatched, 0);
    const totalGap = monthAggs.reduce(
      (s, a) => s + CATEGORY_KEYS.reduce((g, c) => g + a.gapByCategory[c], 0),
      0
    );
    const emergencyCount = monthAggs.reduce((s, a) => s + a.emergencies, 0);
    const catTotals = CATEGORY_KEYS.map((c) => ({
      cat: c,
      gap: monthAggs.reduce((s, a) => s + a.gapByCategory[c], 0),
    })).sort((a, b) => b.gap - a.gap);
    return {
      rate:
        totalOrdered > 0 ? Math.round((totalDispatched / totalOrdered) * 100) : null,
      totalGap,
      emergencyCount,
      worstCategory: catTotals[0].gap > 0 ? catTotals[0].cat : null,
    };
  }, [monthAggs]);

  const gapChartData = useMemo(
    () =>
      monthAggs.map((a) => ({
        name: shortLabel(a.month),
        Consumable: a.gapByCategory["Consumable"],
        "Reusable Instrument": a.gapByCategory["Reusable Instrument"],
        "Capital Equipment": a.gapByCategory["Capital Equipment"],
      })),
    [monthAggs]
  );

  const trendData = useMemo(
    () =>
      monthAggs.map((a) => ({
        name: shortLabel(a.month),
        fulfillment:
          a.anyDispatch && a.ordered > 0
            ? Math.round((a.dispatched / a.ordered) * 100)
            : null,
      })),
    [monthAggs]
  );

  if (loading) {
    return <p className="text-sm text-slate-400">Analyzing order history…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
          Insights · Endodontics
        </h1>
        <p className="mt-1 text-slate-400">
          Last {MONTHS_BACK} months of closed orders, including emergency orders.
          {monthsAnalyzed <= 1 &&
            " Trends become meaningful as more months close — this view grows automatically."}
        </p>
      </div>

      {/* Headline cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <HeadlineCard
          label="Avg fulfillment"
          value={headline.rate !== null ? `${headline.rate}%` : "—"}
          tone={
            headline.rate === null
              ? "neutral"
              : headline.rate >= 100
              ? "good"
              : headline.rate >= 80
              ? "warn"
              : "bad"
          }
        />
        <HeadlineCard
          label="Shortage units"
          value={String(headline.totalGap)}
          tone={headline.totalGap === 0 ? "good" : "warn"}
        />
        <HeadlineCard
          label="Emergency orders"
          value={String(headline.emergencyCount)}
          tone={headline.emergencyCount === 0 ? "good" : "warn"}
        />
        <HeadlineCard
          label="Most-short category"
          value={headline.worstCategory ?? "None"}
          tone={headline.worstCategory ? "warn" : "good"}
          small
        />
      </div>

      {/* Shortage by category per month */}
      <section className="glass rounded-3xl p-6">
        <h2 className="mb-1 text-xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
          Shortage by category
        </h2>
        <p className="mb-5 text-sm text-slate-400">
          Units ordered but not dispatched, per month. Only months with dispatch data show gaps.
        </p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={gapChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0b1526",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 12,
                  color: "#fff",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Consumable" fill="#34d399" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Reusable Instrument" fill="#fbbf24" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Capital Equipment" fill="#60a5fa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Fulfillment trend */}
      <section className="glass rounded-3xl p-6">
        <h2 className="mb-1 text-xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
          Fulfillment trend
        </h2>
        <p className="mb-5 text-sm text-slate-400">
          Dispatched ÷ ordered per month. Months without dispatch data are skipped, not counted as zero.
        </p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} domain={[0, 120]} unit="%" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0b1526",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 12,
                  color: "#fff",
                }}
              />
              <ReferenceLine y={100} stroke="#34d399" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="fulfillment"
                stroke="#34d399"
                strokeWidth={2}
                dot={{ r: 4 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Top shortage items */}
      <section className="glass rounded-3xl p-6">
        <h2 className="mb-1 text-xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
          Top shortage items
        </h2>
        <p className="mb-5 text-sm text-slate-400">
          Repeat offenders across the period — ranked by how often they fell short, then by total gap.
        </p>
        {shortages.length === 0 ? (
          <p className="text-slate-300">
            No shortages recorded yet. Items appear here when the store dispatches less than ordered.
          </p>
        ) : (
          <div className="space-y-2">
            {shortages.slice(0, 10).map((s) => (
              <div
                key={s.catalogueItemId}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {s.item?.variantName ?? "Unknown item"}
                    {s.item?.itemCode && (
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        #{s.item.itemCode}
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">
                    {s.item?.category} · {s.item?.parentName}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-300">
                    short {s.monthsShort} {s.monthsShort === 1 ? "month" : "months"}
                  </span>
                  <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-300">
                    gap {s.totalGap}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function HeadlineCard({
  label,
  value,
  tone = "neutral",
  small = false,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  small?: boolean;
}) {
  const toneCls =
    tone === "good"
      ? "text-emerald"
      : tone === "warn"
      ? "text-amber-300"
      : tone === "bad"
      ? "text-red-300"
      : "text-white";
  return (
    <section className="glass rounded-2xl px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`${small ? "text-lg" : "text-2xl"} font-semibold ${toneCls}`}>{value}</p>
    </section>
  );
}