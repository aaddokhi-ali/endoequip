// app/store/dashboard/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import RoleGuard from "@/components/RoleGuard";
import AppShell from "@/components/AppShell";
import { OrderItem } from "@/lib/types";
import { fetchDepartmentOrder, cycleLabel, calendarMonth } from "@/lib/data/orderApi";

const DEPT = "endo";

export default function StoreDashboardPage() {
  return (
    <RoleGuard allow="store">
      <AppShell>
        <StoreDashboard />
      </AppShell>
    </RoleGuard>
  );
}

function StoreDashboard() {
  const router = useRouter();
  const [lastClosed, setLastClosed] = useState("");
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cycleSnap = await getDoc(doc(db, "orderCycles", DEPT));
      const last =
        (cycleSnap.exists() &&
          (cycleSnap.data() as { lastClosedMonth?: string }).lastClosedMonth) ||
        calendarMonth();
      setLastClosed(last);
      setItems((await fetchDepartmentOrder(last, DEPT)).filter((o) => o.status === "closed"));
    } catch (e) {
      console.error("Store dashboard load failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const itemIds = new Set(items.map((o) => o.catalogueItemId));
    let entered = 0;
    let fullyDispatched = 0;
    for (const id of itemIds) {
      const rows = items.filter((o) => o.catalogueItemId === id);
      const anyEntered = rows.some((o) => typeof o.dispatchedQuantity === "number");
      if (anyEntered) {
        entered++;
        const ordered = rows.reduce((s, o) => s + o.quantity, 0);
        const dispatched = rows.reduce(
          (s, o) => s + (typeof o.dispatchedQuantity === "number" ? o.dispatchedQuantity : 0),
          0
        );
        if (dispatched >= ordered) fullyDispatched++;
      }
    }
    return { totalItems: itemIds.size, entered, fullyDispatched };
  }, [items]);

  if (loading) {
    return <p className="text-sm text-slate-400">Loading dashboard…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
          Store dashboard
        </h1>
        <p className="mt-1 text-slate-400">Fulfillment progress on the latest closed order.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <button
          onClick={() => router.push("/store/orders")}
          className="glass rounded-3xl p-6 text-left transition hover:bg-white/5"
        >
          <p className="mb-1 text-[11px] uppercase tracking-[3px] text-emerald/70">
            Latest closed order
          </p>
          <h2 className="text-xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
            {cycleLabel(lastClosed)}
          </h2>
          {stats.totalItems === 0 ? (
            <p className="mt-2 text-sm text-slate-300">No closed order yet.</p>
          ) : (
            <p className="mt-2 text-sm text-slate-300">
              {stats.totalItems} {stats.totalItems === 1 ? "item" : "items"} ·{" "}
              <span className={stats.fullyDispatched === stats.totalItems ? "font-semibold text-emerald" : "font-semibold text-amber-300"}>
                {stats.fullyDispatched} fully dispatched
              </span>
              {stats.entered < stats.totalItems &&
                ` · ${stats.totalItems - stats.entered} awaiting dispatch entry`}
            </p>
          )}
        </button>

        <button
          onClick={() => router.push("/store/catalogue")}
          className="glass rounded-3xl p-6 text-left transition hover:bg-white/5"
        >
          <p className="mb-1 text-[11px] uppercase tracking-[3px] text-emerald/70">Catalogue</p>
          <h2 className="text-xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
            Manage items
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            Add new supplies, rename groups, hide discontinued items.
          </p>
        </button>
      </div>
    </div>
  );
}