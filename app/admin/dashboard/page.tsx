// app/admin/dashboard/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import RoleGuard from "@/components/RoleGuard";
import AppShell from "@/components/AppShell";
import { PatientCount, ReadyReport, ShortageReport } from "@/lib/types";
import {
  getCycleInfo,
  fetchDepartmentOrder,
  cycleLabel,
  calendarMonth,
} from "@/lib/data/orderApi";
import {
  dateStr,
  dateLabel,
  fetchDeptCounts,
  fetchReadyReport,
  fetchShortages,
  computeDisplayStatus,
  DayDisplayStatus,
} from "@/lib/data/readyApi";
import { buildClinicLabels } from "@/lib/orderSummary";

const DEPT = "endo";
const DEPT_DISPLAY = "Endodontics";

export default function AdminDashboardPage() {
  return (
    <RoleGuard allow="admin">
      <AppShell>
        <AdminDashboard />
      </AppShell>
    </RoleGuard>
  );
}

/** Last 12 months including the current one, newest first. */
function recentMonthsList(): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(calendarMonth(d));
  }
  return out;
}

function monthDisplayLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en", { month: "long", year: "numeric" });
}

function AdminDashboard() {
  const router = useRouter();

  // Today's Ready status
  const [todayCounts, setTodayCounts] = useState<PatientCount[]>([]);
  const [todayReport, setTodayReport] = useState<ReadyReport | null>(null);

  // Order cycle
  const [currentCycle, setCurrentCycle] = useState("");
  const [openEmergencies, setOpenEmergencies] = useState<string[]>([]);
  const [cycleItemCount, setCycleItemCount] = useState(0);
  const [cycleClinicCount, setCycleClinicCount] = useState(0);

  // This month's shortages
  const [monthShortages, setMonthShortages] = useState<ShortageReport[]>([]);

  const [loading, setLoading] = useState(true);

  // Weakness report
  const [reportMonth, setReportMonth] = useState(calendarMonth());
  const [generating, setGenerating] = useState(false);
  const [reportNotice, setReportNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const today = dateStr();
      const thisMonth = calendarMonth();
      const [y, m] = thisMonth.split("-").map(Number);
      const monthEnd = `${thisMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

      const [counts, report, info, shortages] = await Promise.all([
        fetchDeptCounts(today, DEPT),
        fetchReadyReport(today, DEPT),
        getCycleInfo(DEPT),
        fetchShortages(DEPT, `${thisMonth}-01`, monthEnd).catch((e) => {
          console.error("Shortage query failed (index still building?):", e);
          return [] as ShortageReport[];
        }),
      ]);

      const cycleItems = await fetchDepartmentOrder(info.currentMonth, DEPT);

      setTodayCounts(counts);
      setTodayReport(report);
      setCurrentCycle(info.currentMonth);
      setOpenEmergencies(info.emergencies.filter((e) => e.open).map((e) => e.id));
      setCycleItemCount(new Set(cycleItems.map((o) => o.catalogueItemId)).size);
      setCycleClinicCount(new Set(cycleItems.map((o) => o.clinicId)).size);
      setMonthShortages(shortages);
    } catch (e) {
      console.error("Dashboard load failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { status, needed, provided } = computeDisplayStatus(todayCounts, todayReport);

  const shortageStats = useMemo(() => {
    const unresolved = monthShortages.filter((s) => !s.resolved);
    return {
      days: monthShortages.length,
      unresolvedDays: unresolved.length,
      totalGap: monthShortages.reduce((s, r) => s + r.gap, 0),
    };
  }, [monthShortages]);

  async function generateWeaknessReport() {
    setGenerating(true);
    setReportNotice("");
    try {
      const [y, m] = reportMonth.split("-").map(Number);
      const monthEnd = `${reportMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
      const [shortages, labels] = await Promise.all([
        fetchShortages(DEPT, `${reportMonth}-01`, monthEnd),
        buildClinicLabels(),
      ]);

      if (shortages.length === 0) {
        setReportNotice(`No shortage days recorded in ${monthDisplayLabel(reportMonth)} — nothing to report. That's a good month.`);
        setGenerating(false);
        return;
      }

      shortages.sort((a, b) => a.date.localeCompare(b.date));

      // Per-clinic counts for each shortage day, fetched in parallel.
      const countsPerDay = await Promise.all(
        shortages.map((s) => fetchDeptCounts(s.date, DEPT))
      );

      const pdf = new jsPDF();
      const generated = new Date().toLocaleString("en-GB");
      const worst = shortages.reduce((a, b) => (b.gap > a.gap ? b : a));

      pdf.setFontSize(16);
      pdf.text(`Monthly Weakness Report — ${DEPT_DISPLAY}`, 14, 18);
      pdf.setFontSize(11);
      pdf.text(`Period: ${monthDisplayLabel(reportMonth)}`, 14, 26);
      pdf.setFontSize(9);
      pdf.setTextColor(120);
      pdf.text(`Generated ${generated} · EndoEquip Supply`, 14, 32);
      pdf.setTextColor(0);

      // Headline stats
      autoTable(pdf, {
        startY: 40,
        head: [["Summary", ""]],
        body: [
          ["Shortage days", shortages.length],
          ["Total uncovered units", shortages.reduce((s, r) => s + r.gap, 0)],
          ["Worst day", `${worst.date} (gap of ${worst.gap})`],
          [
            "Ended unresolved / corrected same day",
            `${shortages.filter((s) => !s.resolved).length} / ${shortages.filter((s) => s.resolved).length}`,
          ],
        ],
        styles: { fontSize: 10, cellPadding: 3 },
        headStyles: { fillColor: [153, 27, 27] },
      });

      let cursorY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
        .finalY;

      // Day-by-day table
      autoTable(pdf, {
        startY: cursorY + 8,
        head: [["Date", "Needed", "Provided", "Gap", "Status"]],
        body: shortages.map((s) => [
          s.date,
          s.unitsNeeded,
          s.unitsProvided,
          s.gap,
          s.resolved ? "Corrected same day" : "Unresolved",
        ]),
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [16, 78, 66] },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 3) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = [153, 27, 27];
          }
        },
      });

      cursorY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

      // Per-clinic demand on each shortage day
      const breakdownBody: (string | number)[][] = [];
      shortages.forEach((s, i) => {
        const dayCounts = countsPerDay[i]
          .slice()
          .sort((a, b) =>
            (labels.get(a.clinicId) ?? "").localeCompare(labels.get(b.clinicId) ?? "")
          );
        dayCounts.forEach((c, j) => {
          breakdownBody.push([
            j === 0 ? s.date : "",
            labels.get(c.clinicId) ?? c.clinicId,
            c.count,
          ]);
        });
      });

      autoTable(pdf, {
        startY: cursorY + 8,
        head: [["Shortage day", "Clinic", "Patients"]],
        body: breakdownBody,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [16, 78, 66] },
      });

      cursorY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
      pdf.setFontSize(8);
      pdf.setTextColor(120);
      pdf.text(
        "Definition: 1 unit = 1 cassette + 1 high-speed + 1 contra-angle + 1 hook; one complete unit per patient.",
        14,
        cursorY + 8,
        { maxWidth: 180 }
      );

      pdf.save(`weakness-report-${DEPT}-${reportMonth}.pdf`);
      setReportNotice(`Report generated: ${shortages.length} shortage ${shortages.length === 1 ? "day" : "days"} in ${monthDisplayLabel(reportMonth)}.`);
    } catch (e) {
      setReportNotice(e instanceof Error ? `Failed: ${e.message}` : "Report generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-400">Loading dashboard…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
          Dashboard · {DEPT_DISPLAY}
        </h1>
        <p className="mt-1 text-slate-400">{dateLabel(dateStr())}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Today's Ready status */}
        <ReadyStatusCard
          status={status}
          needed={needed}
          provided={provided}
          onClick={() => router.push("/admin/ready")}
        />

        {/* Current order cycle */}
        <button
          onClick={() => router.push("/admin/orders")}
          className="glass rounded-3xl p-6 text-left transition hover:bg-white/5"
        >
          <p className="mb-1 text-[11px] uppercase tracking-[3px] text-emerald/70">Order Hub</p>
          <h2 className="text-xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
            {cycleLabel(currentCycle)}
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            {cycleItemCount === 0
              ? "No items yet this cycle."
              : `${cycleItemCount} ${cycleItemCount === 1 ? "item" : "items"} from ${cycleClinicCount} ${cycleClinicCount === 1 ? "clinic" : "clinics"}.`}
          </p>
          {openEmergencies.length > 0 && (
            <p className="mt-2 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-300">
              {openEmergencies.length === 1
                ? `Emergency open: ${cycleLabel(openEmergencies[0])}`
                : `${openEmergencies.length} emergency orders open`}
            </p>
          )}
        </button>

        {/* This month's shortages */}
        <button
          onClick={() => router.push("/admin/ready")}
          className="glass rounded-3xl p-6 text-left transition hover:bg-white/5"
        >
          <p className="mb-1 text-[11px] uppercase tracking-[3px] text-emerald/70">
            {monthDisplayLabel(calendarMonth())}
          </p>
          <h2 className="text-xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
            Sterilization shortages
          </h2>
          {shortageStats.days === 0 ? (
            <p className="mt-2 text-sm text-emerald">No shortage days this month.</p>
          ) : (
            <p className="mt-2 text-sm text-slate-300">
              <span className="font-semibold text-red-300">{shortageStats.days}</span> shortage{" "}
              {shortageStats.days === 1 ? "day" : "days"} ·{" "}
              <span className="font-semibold text-red-300">{shortageStats.totalGap}</span> units
              uncovered
              {shortageStats.unresolvedDays > 0 &&
                ` · ${shortageStats.unresolvedDays} ended unresolved`}
            </p>
          )}
        </button>
      </div>

      {/* Weakness report generator */}
      <section className="glass rounded-3xl p-6">
        <h2 className="mb-1 text-xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
          Monthly weakness report
        </h2>
        <p className="mb-4 max-w-2xl text-sm text-slate-400">
          Aggregates every sterilization shortage in a month — day-by-day gaps, per-clinic
          demand, and whether each shortage ended unresolved — into a PDF for the authorities.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={reportMonth}
            onChange={(e) => setReportMonth(e.target.value)}
            className="rounded-lg border border-white/15 bg-(--color-navy) px-4 py-2 text-sm text-white outline-none focus:border-emerald/60"
          >
            {recentMonthsList().map((m) => (
              <option key={m} value={m}>
                {monthDisplayLabel(m)}
              </option>
            ))}
          </select>
          <button
            onClick={generateWeaknessReport}
            disabled={generating}
            className="rounded-lg bg-emerald px-6 py-2 text-sm font-semibold text-(--color-navy) transition hover:bg-(--color-emerald-soft) disabled:opacity-60"
          >
            {generating ? "Generating…" : "Generate PDF"}
          </button>
        </div>
        {reportNotice && <p className="mt-3 text-sm text-slate-300">{reportNotice}</p>}
      </section>
    </div>
  );
}

function ReadyStatusCard({
  status,
  needed,
  provided,
  onClick,
}: {
  status: DayDisplayStatus;
  needed: number;
  provided: number | null;
  onClick: () => void;
}) {
  const cls =
    status === "Green"
      ? "border-emerald/40 bg-emerald/10"
      : status === "Red"
      ? "border-red-400/40 bg-red-500/10"
      : "glass border-transparent";
  const statusText =
    status === "Green"
      ? "Green — covered"
      : status === "Red"
      ? "Red — shortage"
      : status === "Awaiting"
      ? "Awaiting sterilization"
      : "No activity yet";
  const statusColor =
    status === "Green" ? "text-emerald" : status === "Red" ? "text-red-300" : "text-slate-300";

  return (
    <button onClick={onClick} className={`rounded-3xl border p-6 text-left transition hover:bg-white/5 ${cls}`}>
      <p className="mb-1 text-[11px] uppercase tracking-[3px] text-emerald/70">
        Ready Hub · today
      </p>
      <h2 className={`text-xl font-bold ${statusColor}`} style={{ fontFamily: "var(--font-display)" }}>
        {statusText}
      </h2>
      {status !== "Blank" && (
        <p className="mt-2 text-sm text-slate-300">
          {needed} {needed === 1 ? "unit" : "units"} needed
          {provided !== null && ` · ${provided} provided`}
          {status === "Red" && ` · gap of ${needed - (provided ?? 0)}`}
        </p>
      )}
    </button>
  );
}