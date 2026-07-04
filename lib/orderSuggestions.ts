// lib/orderSuggestions.ts
// Stage C: order suggestions computed from closed-order history.
//
// Honesty rules, enforced here:
// - An item needs >= MIN_MONTHS months of history before any suggestion is made.
// - Emergency cycles count toward their base month (emergency demand is real demand).
// - "Demand" per month = max(ordered, dispatched): if an emergency top-up pushed
//   dispatched above the original order, true need was higher than the order.

import { OrderItem } from "@/lib/types";
import { getCycleInfo, fetchDepartmentOrder, baseMonth } from "@/lib/data/orderApi";

const MIN_MONTHS = 2;       // fewer than this = no suggestion (one data point is noise)
const LOOKBACK = 3;         // months of history considered
const WEIGHTS = [3, 2, 1];  // most recent month weighted heaviest
const SAFETY = 1.1;         // +10% margin

/** The N months BEFORE the given month (exclusive), most recent first. */
function monthsBefore(month: string, n: number): string[] {
  const [y, m] = month.split("-").map(Number);
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

interface MonthDemand {
  ordered: number;
  dispatched: number | null; // null = no dispatch data entered
}

export interface Suggestion {
  catalogueItemId: string;
  suggested: number;      // the number to suggest
  avgDemand: number;      // unrounded 3-month weighted average, for display/anomaly math
  monthsOfHistory: number;
  wasShort: boolean;      // gap > 0 in any lookback month
}

/**
 * Aggregate raw closed orderItems (already fetched for the lookback cycles)
 * into per-item suggestions. `scope` filters rows first:
 * pass a clinicId for clinic-level suggestions, or null for department-level.
 */
export function computeSuggestions(
  rowsByMonth: Map<string, OrderItem[]>, // key: base month, most recent first
  clinicId: string | null
): Map<string, Suggestion> {
  // itemId -> per-month demand, aligned to the ordered month list
  const months = [...rowsByMonth.keys()];
  const perItem = new Map<string, (MonthDemand | null)[]>();

  months.forEach((m, mi) => {
    const totals = new Map<string, { ordered: number; dispatched: number; any: boolean }>();
    for (const o of rowsByMonth.get(m) ?? []) {
      if (o.status !== "closed") continue;
      if (clinicId && o.clinicId !== clinicId) continue;
      let t = totals.get(o.catalogueItemId);
      if (!t) {
        t = { ordered: 0, dispatched: 0, any: false };
        totals.set(o.catalogueItemId, t);
      }
      t.ordered += o.quantity;
      if (typeof o.dispatchedQuantity === "number") {
        t.dispatched += o.dispatchedQuantity;
        t.any = true;
      }
    }
    for (const [itemId, t] of totals) {
      let arr = perItem.get(itemId);
      if (!arr) {
        arr = new Array(months.length).fill(null);
        perItem.set(itemId, arr);
      }
      arr[mi] = { ordered: t.ordered, dispatched: t.any ? t.dispatched : null };
    }
  });

  const out = new Map<string, Suggestion>();
  for (const [itemId, arr] of perItem) {
    const present = arr.filter((d): d is MonthDemand => d !== null);
    if (present.length < MIN_MONTHS) continue;

    let weightedSum = 0;
    let weightTotal = 0;
    let wasShort = false;
    let lastOrdered = 0;
    let gapSum = 0;
    let gapCount = 0;

    arr.forEach((d, i) => {
      if (!d) return;
      const demand = d.dispatched !== null ? Math.max(d.ordered, d.dispatched) : d.ordered;
      const w = WEIGHTS[i] ?? 1;
      weightedSum += demand * w;
      weightTotal += w;
      if (i === arr.findIndex((x) => x !== null)) lastOrdered = d.ordered;
      if (d.dispatched !== null && d.dispatched < d.ordered) {
        wasShort = true;
        gapSum += d.ordered - d.dispatched;
        gapCount++;
      }
    });

    const avgDemand = weightedSum / weightTotal;
    let suggested = Math.ceil(avgDemand * SAFETY);

    // Shortage floor: proven-insufficient numbers get bumped.
    if (wasShort && gapCount > 0) {
      const floor = Math.ceil(lastOrdered + gapSum / gapCount);
      suggested = Math.max(suggested, floor);
    }

    out.set(itemId, {
      catalogueItemId: itemId,
      suggested,
      avgDemand,
      monthsOfHistory: present.length,
      wasShort,
    });
  }
  return out;
}

/**
 * Fetch the lookback history for a department and compute suggestions.
 * clinicId = per-clinic suggestions (Order Hub); null = department-level (admin review).
 */
export async function loadSuggestions(
  departmentId: string,
  clinicId: string | null
): Promise<Map<string, Suggestion>> {
  const info = await getCycleInfo(departmentId);
  const months = monthsBefore(info.currentMonth, LOOKBACK);

  const rowsByMonth = new Map<string, OrderItem[]>();
  await Promise.all(
    months.map(async (m) => {
      const cycleIds = [
        m,
        ...info.emergencies.filter((e) => baseMonth(e.id) === m).map((e) => e.id),
      ];
      const results = await Promise.all(
        cycleIds.map((c) => fetchDepartmentOrder(c, departmentId))
      );
      rowsByMonth.set(m, results.flat());
    })
  );

  // Preserve most-recent-first order (Promise.all preserves nothing about Map insertion here,
  // so rebuild in order).
  const ordered = new Map<string, OrderItem[]>();
  for (const m of months) ordered.set(m, rowsByMonth.get(m) ?? []);

  return computeSuggestions(ordered, clinicId);
}