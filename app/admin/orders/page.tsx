// app/admin/orders/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import RoleGuard from "@/components/RoleGuard";
import AppShell from "@/components/AppShell";
import { CatalogueItem, OrderItem } from "@/lib/types";
import { fetchCatalogue } from "@/lib/data/catalogueApi";
import {
  getCycleInfo,
  EmergencyEntry,
  fetchDepartmentOrder,
  closeCycle,
  openEmergency,
  cycleLabel,
  calendarMonth,
  nextMonth,
  isEmergency,
  baseMonth,
} from "@/lib/data/orderApi";
import {
  SummedLine,
  summarizeOrder,
  buildClinicLabels,
  indexCatalogue,
} from "@/lib/orderSummary";
import { loadSuggestions, Suggestion } from "@/lib/orderSuggestions";

const DEPT = "endo";

export default function AdminOrdersPage() {
  return (
    <RoleGuard allow="admin">
      <AppShell>
        <OrdersOverview />
      </AppShell>
    </RoleGuard>
  );
}

/** The last N months (inclusive) ending at the given month, newest first. */
function recentMonths(endMonth: string, n: number): string[] {
  const [y, m] = endMonth.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(calendarMonth(d));
  }
  return out;
}

/** Dropdown options: each month followed by its emergencies. */
function buildCycleOptions(monthsList: string[], emergencies: EmergencyEntry[]): string[] {
  const out: string[] = [];
  for (const m of monthsList) {
    out.push(m);
    for (const e of emergencies.filter((e) => baseMonth(e.id) === m)) {
      out.push(e.id);
    }
  }
  return out;
}

function OrdersOverview() {
  const [cycleMonth, setCycleMonth] = useState("");
  const [emergencies, setEmergencies] = useState<EmergencyEntry[]>([]);
  const [selected, setSelected] = useState("");
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [clinicLabels, setClinicLabels] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingCycle, setLoadingCycle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState("");
  const [deptSuggestions, setDeptSuggestions] = useState<Map<string, Suggestion>>(new Map());

  const load = useCallback(async (selectCycle?: string) => {
    setLoading(true);
    const info = await getCycleInfo(DEPT);
    const target = selectCycle ?? info.currentMonth;
    const [items, cat, labels] = await Promise.all([
      fetchDepartmentOrder(target, DEPT),
      fetchCatalogue(DEPT),
      buildClinicLabels(),
    ]);
    setCycleMonth(info.currentMonth);
    setEmergencies(info.emergencies);
    setSelected(target);
    setOrderItems(items);
    setCatalogue(cat);
    setClinicLabels(labels);
    setLoading(false);
    // Department-level suggestions load quietly after the page is usable.
    loadSuggestions(DEPT, null).then(setDeptSuggestions);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changeCycle = useCallback(async (c: string) => {
    setSelected(c);
    setLoadingCycle(true);
    setOrderItems(await fetchDepartmentOrder(c, DEPT));
    setLoadingCycle(false);
    setConfirming(false);
    setNotice("");
  }, []);

  const options = useMemo(
    () => buildCycleOptions(recentMonths(cycleMonth || calendarMonth(), 13), emergencies),
    [cycleMonth, emergencies]
  );

  const isOpenRegular = selected === cycleMonth;
  const openEmergencyEntry = emergencies.find((e) => e.id === selected && e.open);
  const isOpenCycle = isOpenRegular || !!openEmergencyEntry;
  const isClosedRegularMonth = !isEmergency(selected) && !isOpenRegular;

  const byId = useMemo(() => indexCatalogue(catalogue), [catalogue]);

  const lines = useMemo<SummedLine[]>(
    () => summarizeOrder(orderItems, byId, clinicLabels),
    [orderItems, byId, clinicLabels]
  );

  const clinicsParticipating = useMemo(
    () => new Set(orderItems.map((o) => o.clinicId)).size,
    [orderItems]
  );

  const stats = useMemo(() => {
    let ordered = 0;
    let dispatched = 0;
    let shortageItems = 0;
    let anyDispatch = false;
    for (const l of lines) {
      ordered += l.total;
      dispatched += l.totalDispatched;
      if (l.anyDispatchEntered) {
        anyDispatch = true;
        if (l.totalDispatched < l.total) shortageItems++;
      }
    }
    return {
      ordered,
      dispatched,
      shortageItems,
      anyDispatch,
      rate: ordered > 0 ? Math.round((dispatched / ordered) * 100) : 0,
    };
  }, [lines]);

  const anomalies = useMemo(() => {
    if (!isOpenRegular || deptSuggestions.size === 0) return [];
    const orderedById = new Map<string, number>();
    for (const l of lines) orderedById.set(l.catalogueItemId, l.total);
    const out: { name: string; note: string }[] = [];
    for (const [itemId, s] of deptSuggestions) {
      const ordered = orderedById.get(itemId) ?? 0;
      const item = byId.get(itemId);
      const name = item?.variantName ?? "Unknown item";
      if (ordered === 0) {
        out.push({ name, note: `not ordered this month — usually ~${Math.round(s.avgDemand)}` });
      } else if (ordered < s.avgDemand * 0.6) {
        out.push({ name, note: `${ordered} ordered — 3-month average is ~${Math.round(s.avgDemand)}` });
      }
    }
    return out.slice(0, 8);
  }, [isOpenRegular, deptSuggestions, lines, byId]);

  async function handleClose() {
    setBusy(true);
    setNotice("");
    try {
      const n = await closeCycle(selected, DEPT);
      const msg = isEmergency(selected)
        ? `${cycleLabel(selected)} closed (${n} ${n === 1 ? "line" : "lines"}). Sent to store.`
        : `${cycleLabel(selected)} closed (${n} ${n === 1 ? "line" : "lines"}). ` +
          `Clinics are now building ${cycleLabel(nextMonth(selected))}.`;
      setConfirming(false);
      await load(isEmergency(selected) ? selected : undefined);
      setNotice(msg);
    } catch (e) {
      setNotice(e instanceof Error ? `Close failed: ${e.message}` : "Close failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenEmergency() {
    setBusy(true);
    setNotice("");
    try {
      const id = await openEmergency(selected, DEPT);
      await load(id);
      setNotice(`${cycleLabel(id)} is now open. Clinics can add urgent items.`);
    } catch (e) {
      setNotice(e instanceof Error ? `Couldn't open emergency: ${e.message}` : "Couldn't open emergency.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-400">Loading orders…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
            Orders · Endodontics
          </h1>
          <p className="mt-1 text-slate-400">
            <span className={isEmergency(selected) ? "text-red-300" : "text-white"}>
              {cycleLabel(selected)}
            </span>
            {isOpenCycle ? " · open — updates live as clinics add items." : " · closed — history view."}
            {" "}
            {lines.length} {lines.length === 1 ? "item" : "items"} from {clinicsParticipating}{" "}
            {clinicsParticipating === 1 ? "clinic" : "clinics"}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selected}
            onChange={(e) => changeCycle(e.target.value)}
            className="rounded-lg border border-white/15 bg-(--color-navy) px-4 py-2 text-sm text-white outline-none focus:border-emerald/60"
          >
            {options.map((c) => (
              <option key={c} value={c}>
                {cycleLabel(c)}
                {c === cycleMonth ? " (open)" : ""}
                {emergencies.find((e) => e.id === c && e.open) ? " (open)" : ""}
              </option>
            ))}
          </select>

          {isOpenCycle && !confirming && (
            <button
              onClick={() => setConfirming(true)}
              disabled={busy}
              className="rounded-lg bg-emerald px-6 py-2.5 text-sm font-semibold text-(--color-navy) transition hover:bg-(--color-emerald-soft) disabled:opacity-60"
            >
              Close &amp; Send
            </button>
          )}

          {isClosedRegularMonth && (
            <button
              onClick={handleOpenEmergency}
              disabled={busy}
              className="rounded-lg border border-red-400/40 px-5 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-60"
            >
              {busy ? "Opening…" : "Open emergency order"}
            </button>
          )}
        </div>
      </div>

      {confirming && isOpenCycle && (
        <div className="glass flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
          <p className="text-sm text-slate-200">
            Close <span className="font-semibold text-white">{cycleLabel(selected)}</span>?
            {isEmergency(selected)
              ? " Its items will be sent to the store."
              : ` Clinics will start building ${cycleLabel(nextMonth(selected))}.`}
          </p>
          <button
            onClick={handleClose}
            disabled={busy}
            className="rounded-lg bg-emerald px-4 py-1.5 text-xs font-semibold text-(--color-navy) transition hover:bg-(--color-emerald-soft) disabled:opacity-60"
          >
            {busy ? "Closing…" : "Yes, close it"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="rounded-lg border border-white/15 px-4 py-1.5 text-xs text-slate-300 transition hover:text-white"
          >
            Cancel
          </button>
        </div>
      )}

      {notice && (
        <p className="rounded-lg bg-emerald-500/15 px-4 py-2.5 text-sm text-emerald-300">{notice}</p>
      )}

      {anomalies.length > 0 && (
        <section className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
          <p className="mb-2 text-sm font-semibold text-amber-300">
            Review before closing — these look low vs history:
          </p>
          <ul className="space-y-1">
            {anomalies.map((a, i) => (
              <li key={i} className="text-sm text-slate-200">
                <span className="font-medium text-white">{a.name}</span>
                <span className="text-slate-400"> · {a.note}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {lines.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Order lines" value={String(lines.length)} />
          <StatCard label="Units ordered" value={String(stats.ordered)} />
          <StatCard
            label="Units dispatched"
            value={stats.anyDispatch ? String(stats.dispatched) : "—"}
          />
          <StatCard
            label={stats.anyDispatch ? `Fulfillment · ${stats.shortageItems} short` : "Fulfillment"}
            value={stats.anyDispatch ? `${stats.rate}%` : "—"}
            tone={
              !stats.anyDispatch
                ? "neutral"
                : stats.rate >= 100
                ? "good"
                : stats.rate >= 80
                ? "warn"
                : "bad"
            }
          />
        </div>
      )}

      {loadingCycle ? (
        <p className="text-sm text-slate-400">Loading {cycleLabel(selected)}…</p>
      ) : lines.length === 0 ? (
        <section className="glass rounded-3xl p-8">
          <p className="text-slate-300">
            {isOpenCycle
              ? `No items in ${cycleLabel(selected)} yet. This fills automatically as clinics add items in their Order Hub.`
              : `No order recorded for ${cycleLabel(selected)}.`}
          </p>
        </section>
      ) : (
        <div className="space-y-2">
          {lines.map((l) => (
            <SummedRow key={l.catalogueItemId} line={l} showDispatch={!isOpenCycle} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "bad";
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
      <p className={`text-2xl font-semibold ${toneCls}`}>{value}</p>
    </section>
  );
}

function lineBadge(line: SummedLine, showDispatch: boolean): { text: string; cls: string } {
  if (!showDispatch || !line.anyDispatchEntered) {
    return { text: String(line.total), cls: "bg-emerald/15 text-emerald" };
  }
  if (line.totalDispatched >= line.total) {
    return {
      text: `${line.totalDispatched} / ${line.total}`,
      cls: "bg-emerald/15 text-emerald",
    };
  }
  return {
    text: `${line.totalDispatched} / ${line.total}`,
    cls: "bg-amber-500/15 text-amber-300",
  };
}

function SummedRow({ line, showDispatch }: { line: SummedLine; showDispatch: boolean }) {
  const [open, setOpen] = useState(false);
  const badge = lineBadge(line, showDispatch);

  return (
    <section className="glass rounded-2xl p-4">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 text-left">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 text-slate-300">
          {open ? "−" : "+"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-medium text-white">
            {line.item?.variantName ?? "Unknown item"}
          </span>
          {line.item?.itemCode && (
            <span className="ml-2 text-xs text-slate-500">#{line.item.itemCode}</span>
          )}
          <span className="block text-[11px] uppercase tracking-wide text-slate-500">
            {line.item?.parentName}
            {line.item?.unit ? ` · ${line.item.unit}` : ""}
          </span>
        </span>
        <span className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-bold ${badge.cls}`}>
          {badge.text}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-1 border-t border-white/10 pt-3 pl-10">
          {showDispatch && (
            <div className="flex items-center justify-between px-2 pb-1 text-[11px] uppercase tracking-wide text-slate-500">
              <span>Clinic</span>
              <span className="flex items-center gap-4">
                <span className="w-14 text-center">Ordered</span>
                <span className="w-20 text-center">Dispatched</span>
              </span>
            </div>
          )}
          {line.perClinic.map((c, i) =>
            showDispatch ? (
              <div key={`${c.clinicLabel}-${i}`} className="flex items-center justify-between px-2 py-1">
                <span className="text-sm text-slate-300">{c.clinicLabel}</span>
                <span className="flex items-center gap-4">
                  <span className="w-14 text-center text-sm font-semibold text-slate-200">
                    {c.quantity}
                  </span>
                  <span className="w-20 text-center text-sm font-semibold text-slate-200">
                    {c.dispatched ?? "—"}
                  </span>
                </span>
              </div>
            ) : (
              <div key={`${c.clinicLabel}-${i}`} className="flex items-center justify-between px-2 py-1">
                <span className="text-sm text-slate-300">{c.clinicLabel}</span>
                <span className="text-sm font-semibold text-slate-200">{c.quantity}</span>
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}