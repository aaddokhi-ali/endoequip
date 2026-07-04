// app/clinic/order/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import RoleGuard from "@/components/RoleGuard";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/lib/hooks/useAuth";
import { CatalogueItem, OrderItem, Clinic, Department, clinicLabel } from "@/lib/types";
import { fetchCatalogue } from "@/lib/data/catalogueApi";
import { groupByParent, ParentGroup } from "@/lib/catalogueGrouping";
import {
  getCycleInfo,
  fetchClinicOrder,
  setOrderQuantity,
  removeOrderItem,
  cycleLabel,
  isEmergency,
} from "@/lib/data/orderApi";
import { loadSuggestions, Suggestion } from "@/lib/orderSuggestions";

export default function ClinicOrderPage() {
  return (
    <RoleGuard allow="clinic">
      <AppShell>
        <OrderHub />
      </AppShell>
    </RoleGuard>
  );
}

function OrderHub() {
  const { appUser } = useAuth();
  const clinicId = appUser?.clinicId ?? null;
  const departmentId = appUser?.departmentId ?? null;

  const [cycles, setCycles] = useState<string[]>([]); // [regular, ...open emergencies]
  const [activeCycle, setActiveCycle] = useState("");
  const [label, setLabel] = useState("");
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [order, setOrder] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<Map<string, Suggestion>>(new Map());

  useEffect(() => {
    if (!clinicId || !departmentId) return;
    (async () => {
      setLoading(true);
      const info = await getCycleInfo(departmentId);
      const openCycles = [
        info.currentMonth,
        ...info.emergencies.filter((e) => e.open).map((e) => e.id),
      ];
      const [items, existing, labelText] = await Promise.all([
        fetchCatalogue(departmentId),
        fetchClinicOrder(openCycles[0], clinicId),
        clinicDisplayLabel(clinicId, departmentId),
      ]);
      setCycles(openCycles);
      setActiveCycle(openCycles[0]);
      setCatalogue(items.filter((i) => i.active));
      setOrder(existing);
      setLabel(labelText);
      setLoading(false);
      // Suggestions arrive quietly after the page is usable — not awaited.
      loadSuggestions(departmentId, clinicId).then(setSuggestions);
    })();
  }, [clinicId, departmentId]);

  const switchCycle = useCallback(
    async (c: string) => {
      if (!clinicId) return;
      setActiveCycle(c);
      setOrder(await fetchClinicOrder(c, clinicId));
    },
    [clinicId]
  );

  const refreshOrder = useCallback(async () => {
    if (!activeCycle || !clinicId) return;
    setOrder(await fetchClinicOrder(activeCycle, clinicId));
  }, [activeCycle, clinicId]);

  const groups = useMemo(() => groupByParent(catalogue), [catalogue]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => {
        const parentHit = g.parentName.toLowerCase().includes(q);
        const variants = parentHit
          ? g.variants
          : g.variants.filter(
              (v) =>
                v.variantName.toLowerCase().includes(q) ||
                v.itemCode.toLowerCase().includes(q)
            );
        return { ...g, variants };
      })
      .filter((g) => g.variants.length > 0);
  }, [groups, search]);

  const byId = useMemo(() => {
    const m = new Map<string, CatalogueItem>();
    catalogue.forEach((i) => m.set(i.id, i));
    return m;
  }, [catalogue]);

  const qtyOf = useMemo(() => {
    const m = new Map<string, number>();
    order.forEach((o) => m.set(o.catalogueItemId, o.quantity));
    return m;
  }, [order]);

  async function setQty(item: CatalogueItem, quantity: number) {
    if (!clinicId || !departmentId || !activeCycle) return;
    await setOrderQuantity({
      month: activeCycle,
      departmentId,
      clinicId,
      catalogueItemId: item.id,
      quantity,
    });
    refreshOrder();
  }

  async function remove(catalogueItemId: string) {
    if (!clinicId || !activeCycle) return;
    await removeOrderItem(activeCycle, clinicId, catalogueItemId);
    refreshOrder();
  }

  if (loading) {
    return <p className="text-sm text-slate-400">Loading Order Hub…</p>;
  }

  const emergencyActive = isEmergency(activeCycle);
  const hasEmergencies = cycles.length > 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
          Order Hub
        </h1>
        <p className="mt-1 text-slate-400">
          {label && <span className="font-medium text-emerald">{label}</span>}
          {label && " · "}
          Building the{" "}
          <span className={emergencyActive ? "text-red-300" : "text-white"}>
            {cycleLabel(activeCycle)}
          </span>{" "}
          order. Entries save instantly — the order stays open until admin closes it.
        </p>
      </div>

      {hasEmergencies && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4">
          <p className="mb-3 text-sm font-semibold text-red-300">
            An emergency order is open. Choose which order you're adding to:
          </p>
          <div className="flex flex-wrap gap-2">
            {cycles.map((c) => {
              const active = c === activeCycle;
              const emg = isEmergency(c);
              return (
                <button
                  key={c}
                  onClick={() => switchCycle(c)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    active
                      ? emg
                        ? "bg-red-500/25 text-red-200 border border-red-400/50"
                        : "bg-emerald/20 text-emerald border border-emerald/40"
                      : "border border-white/15 text-slate-300 hover:text-white"
                  }`}
                >
                  {cycleLabel(c)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Browse panel */}
        <div className="space-y-3">
          <input
            className="w-full rounded-xl border border-white/15 bg-(--color-navy) px-4 py-2.5 text-sm text-white outline-none focus:border-emerald/60"
            placeholder="Search items or hospital codes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {filtered.length === 0 && (
            <p className="text-sm text-slate-500">No items match “{search}”.</p>
          )}
          {filtered.map((g) => (
            <BrowseGroup
              key={g.parentId}
              group={g}
              qtyOf={qtyOf}
              suggestions={suggestions}
              onSet={setQty}
              forceOpen={search.trim().length > 0}
            />
          ))}
        </div>

        {/* My order panel */}
        <aside className="lg:sticky lg:top-6 h-fit">
          <section
            className={`glass rounded-3xl p-5 ${
              emergencyActive ? "border border-red-400/30" : ""
            }`}
          >
            <h2 className="mb-1 text-xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
              My order
            </h2>
            <p className={`mb-4 text-xs ${emergencyActive ? "text-red-300" : "text-slate-500"}`}>
              {order.length === 0
                ? `Nothing added yet · ${cycleLabel(activeCycle)}`
                : `${order.length} ${order.length === 1 ? "item" : "items"} · ${cycleLabel(activeCycle)}`}
            </p>
            <div className="space-y-2">
              {order
                .slice()
                .sort((a, b) => {
                  const na = byId.get(a.catalogueItemId)?.variantName ?? "";
                  const nb = byId.get(b.catalogueItemId)?.variantName ?? "";
                  return na.localeCompare(nb);
                })
                .map((o) => {
                  const item = byId.get(o.catalogueItemId);
                  return (
                    <OrderLine
                      key={o.id}
                      item={item}
                      qty={o.quantity}
                      onQty={(n) => item && setQty(item, n)}
                      onRemove={() => remove(o.catalogueItemId)}
                    />
                  );
                })}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function BrowseGroup({
  group,
  qtyOf,
  suggestions,
  onSet,
  forceOpen,
}: {
  group: ParentGroup;
  qtyOf: Map<string, number>;
  suggestions: Map<string, Suggestion>;
  onSet: (item: CatalogueItem, qty: number) => Promise<void>;
  forceOpen: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;
  const inOrder = group.variants.filter((v) => qtyOf.has(v.id)).length;

  return (
    <section className="glass rounded-2xl p-4">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 text-left">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 text-slate-300">
          {isOpen ? "−" : "+"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-medium text-white">{group.parentName}</span>
          <span className="ml-2 text-xs text-slate-500">{group.variants.length} items</span>
          <span className="block text-[11px] uppercase tracking-wide text-slate-500">
            {group.category} · {group.subcategory}
          </span>
        </span>
        {inOrder > 0 && (
          <span className="shrink-0 rounded-full bg-emerald/15 px-3 py-1 text-xs font-semibold text-emerald">
            {inOrder} in order
          </span>
        )}
      </button>

      {isOpen && (
        <div className="mt-3 space-y-1 border-t border-white/10 pt-3 pl-10">
          {group.variants
            .filter((v) => v.active)
            .map((v) => (
              <BrowseVariant
                key={v.id}
                item={v}
                currentQty={qtyOf.get(v.id)}
                suggestion={suggestions.get(v.id)}
                onSet={onSet}
              />
            ))}
        </div>
      )}
    </section>
  );
}

function BrowseVariant({
  item,
  currentQty,
  suggestion,
  onSet,
}: {
  item: CatalogueItem;
  currentQty: number | undefined;
  suggestion: Suggestion | undefined;
  onSet: (item: CatalogueItem, qty: number) => Promise<void>;
}) {
  const [qty, setQty] = useState(currentQty ?? 1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (currentQty !== undefined) setQty(currentQty);
  }, [currentQty]);

  async function apply() {
    setBusy(true);
    await onSet(item, qty);
    setBusy(false);
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5">
      <div className="min-w-0">
        <span className="text-sm text-slate-200">{item.variantName}</span>
        {item.itemCode && <span className="ml-2 text-xs text-slate-500">#{item.itemCode}</span>}
        <span className="ml-2 text-xs text-slate-500">{item.unit}</span>
        {suggestion && (
          <button
            onClick={() => setQty(suggestion.suggested)}
            title={`Based on your last ${suggestion.monthsOfHistory} months${
              suggestion.wasShort ? " (was short — bumped up)" : ""
            }`}
            className="ml-2 text-xs text-emerald/80 transition hover:text-emerald"
          >
            Suggested: {suggestion.suggested}
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
          className="w-16 rounded-lg border border-white/15 bg-(--color-navy) px-2 py-1 text-center text-sm text-white outline-none focus:border-emerald/60"
        />
        <button
          onClick={apply}
          disabled={busy}
          className={`rounded-lg px-3 py-1 text-xs font-semibold transition disabled:opacity-50 ${
            currentQty !== undefined
              ? "bg-white/10 text-slate-200 hover:bg-white/15"
              : "bg-emerald text-(--color-navy) hover:bg-(--color-emerald-soft)"
          }`}
        >
          {busy ? "…" : currentQty !== undefined ? "Update" : "Add"}
        </button>
      </div>
    </div>
  );
}

function OrderLine({
  item,
  qty,
  onQty,
  onRemove,
}: {
  item: CatalogueItem | undefined;
  qty: number;
  onQty: (n: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm text-slate-200">{item?.variantName ?? "Unknown item"}</p>
        <p className="text-[11px] text-slate-500">
          {item?.parentName}
          {item?.itemCode ? ` · #${item.itemCode}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => onQty(Math.max(1, Number(e.target.value)))}
          className="w-14 rounded-lg border border-white/15 bg-(--color-navy) px-2 py-1 text-center text-sm text-white outline-none focus:border-emerald/60"
        />
        <button
          onClick={onRemove}
          className="rounded-lg border border-white/15 px-2 py-1 text-xs text-slate-400 transition hover:border-red-400/40 hover:text-red-300"
          aria-label="Remove"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/** "ENDO258" from the clinic + department docs. */
async function clinicDisplayLabel(clinicId: string, departmentId: string): Promise<string> {
  const [cSnap, dSnap] = await Promise.all([
    getDoc(doc(db, "clinics", clinicId)),
    getDoc(doc(db, "departments", departmentId)),
  ]);
  if (!cSnap.exists() || !dSnap.exists()) return "";
  const clinic = cSnap.data() as Clinic;
  const dept = dSnap.data() as Department;
  return clinicLabel(dept.code, clinic.number);
}