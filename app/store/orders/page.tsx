// app/store/orders/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import RoleGuard from "@/components/RoleGuard";
import AppShell from "@/components/AppShell";
import { CatalogueItem, OrderItem } from "@/lib/types";
import { fetchCatalogue } from "@/lib/data/catalogueApi";
import {
  fetchDepartmentOrder,
  setDispatchedQuantity,
  monthLabel,
  calendarMonth,
} from "@/lib/data/orderApi";
import {
  SummedLine,
  ClinicShare,
  summarizeOrder,
  buildClinicLabels,
  indexCatalogue,
} from "@/lib/orderSummary";

const DEPT = "endo";
const DEPT_DISPLAY = "Endodontics";

export default function StoreOrdersPage() {
  return (
    <RoleGuard allow="store">
      <AppShell>
        <StoreOrders />
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

function StoreOrders() {
  const [selectedMonth, setSelectedMonth] = useState("");
  const [months, setMonths] = useState<string[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [clinicLabels, setClinicLabels] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMonth, setLoadingMonth] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const cycleSnap = await getDoc(doc(db, "orderCycles", DEPT));
      const lastClosed =
        (cycleSnap.exists() &&
          (cycleSnap.data() as { lastClosedMonth?: string }).lastClosedMonth) ||
        calendarMonth();
      const [items, cat, labels] = await Promise.all([
        fetchDepartmentOrder(lastClosed, DEPT),
        fetchCatalogue(DEPT),
        buildClinicLabels(),
      ]);
      setMonths(recentMonths(lastClosed, 12));
      setSelectedMonth(lastClosed);
      setOrderItems(items);
      setCatalogue(cat);
      setClinicLabels(labels);
      setLoading(false);
    })();
  }, []);

  const refreshMonth = useCallback(async (m: string) => {
    setOrderItems(await fetchDepartmentOrder(m, DEPT));
  }, []);

  const changeMonth = useCallback(
    async (m: string) => {
      setSelectedMonth(m);
      setLoadingMonth(true);
      await refreshMonth(m);
      setLoadingMonth(false);
    },
    [refreshMonth]
  );

  const byId = useMemo(() => indexCatalogue(catalogue), [catalogue]);

  // The store only sees CLOSED items — an open month shows as "not yet sent".
  const closedItems = useMemo(
    () => orderItems.filter((o) => o.status === "closed"),
    [orderItems]
  );

  const lines = useMemo(
    () => summarizeOrder(closedItems, byId, clinicLabels),
    [closedItems, byId, clinicLabels]
  );

  const clinicsParticipating = useMemo(
    () => new Set(closedItems.map((o) => o.clinicId)).size,
    [closedItems]
  );

  async function saveDispatch(share: ClinicShare, value: number) {
    await setDispatchedQuantity(share.orderItemDocId, value);
    await refreshMonth(selectedMonth);
  }

  function exportPdf() {
    const pdf = new jsPDF();
    const generated = new Date().toLocaleString("en-GB");

    pdf.setFontSize(16);
    pdf.text(`Dispatch Report — ${DEPT_DISPLAY}`, 14, 18);
    pdf.setFontSize(11);
    pdf.text(`Order month: ${monthLabel(selectedMonth)}`, 14, 26);
    pdf.setFontSize(9);
    pdf.setTextColor(120);
    pdf.text(`Generated ${generated} · EndoEquip Supply`, 14, 32);
    pdf.setTextColor(0);

    const body: (string | number)[][] = [];
    for (const l of lines) {
      const name = l.item?.variantName ?? "Unknown item";
      const code = l.item?.itemCode ? `#${l.item.itemCode}` : "";
      const unit = l.item?.unit ?? "";
      // Item summary row
      body.push([
        `${name} ${code}`.trim(),
        unit,
        "ALL",
        l.total,
        l.anyDispatchEntered ? l.totalDispatched : "—",
        l.anyDispatchEntered ? l.total - l.totalDispatched : "—",
      ]);
      // Per-clinic rows
      for (const c of l.perClinic) {
        body.push([
          "", // item column blank for breakdown rows
          "",
          c.clinicLabel,
          c.quantity,
          c.dispatched ?? "—",
          c.dispatched !== null ? c.quantity - c.dispatched : "—",
        ]);
      }
    }

    autoTable(pdf, {
      startY: 38,
      head: [["Item", "Unit", "Clinic", "Ordered", "Dispatched", "Gap"]],
      body,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [16, 78, 66] },
      didParseCell: (data) => {
        // Bold the item summary rows (Clinic column === "ALL")
        if (data.section === "body" && data.row.raw && (data.row.raw as unknown[])[2] === "ALL") {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [235, 242, 240];
        }
      },
    });

    pdf.save(`dispatch-report-${DEPT}-${selectedMonth}.pdf`);
  }

  if (loading) {
    return <p className="text-sm text-slate-400">Loading orders…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
            Closed orders · {DEPT_DISPLAY}
          </h1>
          <p className="mt-1 text-slate-400">
            {lines.length > 0 ? (
              <>
                <span className="text-white">{monthLabel(selectedMonth)}</span> ·{" "}
                {lines.length} {lines.length === 1 ? "item" : "items"} from{" "}
                {clinicsParticipating} {clinicsParticipating === 1 ? "clinic" : "clinics"}.
                Expand a row to record what each clinic received.
              </>
            ) : (
              <>Orders appear here after admin closes a month.</>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedMonth}
            onChange={(e) => changeMonth(e.target.value)}
            className="rounded-lg border border-white/15 bg-(--color-navy) px-4 py-2 text-sm text-white outline-none focus:border-emerald/60"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          {lines.length > 0 && (
            <button
              onClick={exportPdf}
              className="rounded-lg bg-emerald px-5 py-2 text-sm font-semibold text-(--color-navy) transition hover:bg-(--color-emerald-soft)"
            >
              Export PDF
            </button>
          )}
        </div>
      </div>

      {loadingMonth ? (
        <p className="text-sm text-slate-400">Loading {monthLabel(selectedMonth)}…</p>
      ) : lines.length === 0 ? (
        <section className="glass rounded-3xl p-8">
          <p className="text-slate-300">
            No closed order for {monthLabel(selectedMonth)}. Either nothing was ordered, or
            admin hasn't closed this month yet.
          </p>
        </section>
      ) : (
        <div className="space-y-2">
          {lines.map((l) => (
            <StoreRow key={l.catalogueItemId} line={l} onSaveDispatch={saveDispatch} />
          ))}
        </div>
      )}
    </div>
  );
}

function dispatchBadge(line: SummedLine): { text: string; cls: string } {
  if (!line.anyDispatchEntered) {
    return { text: `Ordered ${line.total}`, cls: "bg-white/10 text-slate-300" };
  }
  if (line.totalDispatched >= line.total) {
    return {
      text: `${line.totalDispatched} / ${line.total} dispatched`,
      cls: "bg-emerald/15 text-emerald",
    };
  }
  return {
    text: `${line.totalDispatched} / ${line.total} dispatched`,
    cls: "bg-amber-500/15 text-amber-300",
  };
}

function StoreRow({
  line,
  onSaveDispatch,
}: {
  line: SummedLine;
  onSaveDispatch: (share: ClinicShare, value: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const badge = dispatchBadge(line);

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
          <div className="flex items-center justify-between px-2 pb-1 text-[11px] uppercase tracking-wide text-slate-500">
            <span>Clinic</span>
            <span className="flex items-center gap-4">
              <span className="w-14 text-center">Ordered</span>
              <span className="w-20 text-center">Dispatched</span>
            </span>
          </div>
          {line.perClinic.map((c) => (
            <DispatchRow key={c.orderItemDocId} share={c} onSave={onSaveDispatch} />
          ))}
        </div>
      )}
    </section>
  );
}

function DispatchRow({
  share,
  onSave,
}: {
  share: ClinicShare;
  onSave: (share: ClinicShare, value: number) => Promise<void>;
}) {
  const [value, setValue] = useState<string>(
    share.dispatched !== null ? String(share.dispatched) : ""
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValue(share.dispatched !== null ? String(share.dispatched) : "");
  }, [share.dispatched]);

  const parsed = value === "" ? null : Math.max(0, Number(value));
  const dirty = parsed !== null && parsed !== share.dispatched;

  async function save() {
    if (parsed === null || !dirty) return;
    setBusy(true);
    await onSave(share, parsed);
    setBusy(false);
  }

  return (
    <div className="flex items-center justify-between px-2 py-1">
      <span className="text-sm text-slate-300">{share.clinicLabel}</span>
      <span className="flex items-center gap-4">
        <span className="w-14 text-center text-sm font-semibold text-slate-200">
          {share.quantity}
        </span>
        <span className="flex w-20 items-center justify-center gap-1">
          <input
            type="number"
            min={0}
            value={value}
            placeholder="—"
            onChange={(e) => setValue(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className={`w-16 rounded-lg border bg-(--color-navy) px-2 py-1 text-center text-sm text-white outline-none focus:border-emerald/60 ${
              dirty ? "border-amber-400/50" : "border-white/15"
            }`}
            disabled={busy}
          />
        </span>
      </span>
    </div>
  );
}