// app/admin/ready/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import RoleGuard from "@/components/RoleGuard";
import AppShell from "@/components/AppShell";
import { PatientCount, ReadyReport } from "@/lib/types";
import { buildClinicLabels } from "@/lib/orderSummary";
import {
  dateStr,
  dateLabel,
  fetchDeptCounts,
  fetchReadyReport,
  fetchReadyReportsRange,
  computeDisplayStatus,
} from "@/lib/data/readyApi";

const DEPT = "endo";
const DEPT_DISPLAY = "Endodontics";

export default function AdminReadyPage() {
  return (
    <RoleGuard allow="admin">
      <AppShell>
        <AdminReady />
      </AppShell>
    </RoleGuard>
  );
}

function ym(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function AdminReady() {
  const [selectedDate, setSelectedDate] = useState(dateStr());
  const [counts, setCounts] = useState<PatientCount[]>([]);
  const [report, setReport] = useState<ReadyReport | null>(null);
  const [clinicLabels, setClinicLabels] = useState<Map<string, string>>(new Map());
  const [calMonth, setCalMonth] = useState(ym(new Date()));
  const [monthReports, setMonthReports] = useState<ReadyReport[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDay = useCallback(async (date: string) => {
    setLoading(true);
    const [all, rep, labels] = await Promise.all([
      fetchDeptCounts(date, DEPT),
      fetchReadyReport(date, DEPT),
      buildClinicLabels(),
    ]);
    setCounts(all);
    setReport(rep);
    setClinicLabels(labels);
    setLoading(false);
  }, []);

  const loadMonth = useCallback(async (month: string) => {
    const [y, m] = month.split("-").map(Number);
    const start = `${month}-01`;
    const end = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
    setMonthReports(await fetchReadyReportsRange(DEPT, start, end));
  }, []);

  useEffect(() => {
    loadDay(selectedDate);
  }, [selectedDate, loadDay]);

  useEffect(() => {
    loadMonth(calMonth);
  }, [calMonth, loadMonth]);

  const { status, needed, provided } = computeDisplayStatus(counts, report);

  const reportByDate = useMemo(() => {
    const m = new Map<string, ReadyReport>();
    monthReports.forEach((r) => m.set(r.date, r));
    return m;
  }, [monthReports]);

  function shiftMonth(delta: number) {
    const [y, m] = calMonth.split("-").map(Number);
    setCalMonth(ym(new Date(y, m - 1 + delta, 1)));
  }

  function exportShortagePdf() {
    const gap = needed - (report?.unitsProvided ?? 0);
    const pdf = new jsPDF();
    const generated = new Date().toLocaleString("en-GB");

    pdf.setFontSize(16);
    pdf.text(`Sterilization Shortage Report — ${DEPT_DISPLAY}`, 14, 18);
    pdf.setFontSize(11);
    pdf.text(`Date: ${dateLabel(selectedDate)} (${selectedDate})`, 14, 26);
    pdf.setFontSize(9);
    pdf.setTextColor(120);
    pdf.text(`Generated ${generated} · EndoEquip Supply`, 14, 32);
    pdf.setTextColor(0);

    autoTable(pdf, {
      startY: 40,
      head: [["", "Units"]],
      body: [
        ["Units needed (patients)", needed],
        ["Units provided", report?.unitsProvided ?? 0],
        ["SHORTAGE (gap)", gap],
      ],
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [153, 27, 27] },
      didParseCell: (data) => {
        if (data.section === "body" && data.row.index === 2) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = [153, 27, 27];
        }
      },
    });

    const afterFirst = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY;

    autoTable(pdf, {
      startY: afterFirst + 8,
      head: [["Clinic", "Patients"]],
      body: counts
        .slice()
        .sort((a, b) =>
          (clinicLabels.get(a.clinicId) ?? "").localeCompare(clinicLabels.get(b.clinicId) ?? "")
        )
        .map((c) => [clinicLabels.get(c.clinicId) ?? c.clinicId, c.count]),
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [16, 78, 66] },
    });

    const afterSecond = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY;
    pdf.setFontSize(9);
    pdf.setTextColor(120);
    pdf.text(
      `Spare components (informational): ${report?.extraHandpieces ?? 0} high-speeds, ` +
        `${report?.extraContraAngles ?? 0} contra-angles, ${report?.extraHooks ?? 0} hooks. ` +
        `Definition: 1 unit = 1 cassette + 1 high-speed + 1 contra-angle + 1 hook.`,
      14,
      afterSecond + 8,
      { maxWidth: 180 }
    );

    pdf.save(`shortage-report-${DEPT}-${selectedDate}.pdf`);
  }

  // ---- Calendar grid ----
  const [cy, cm] = calMonth.split("-").map(Number);
  const daysInMonth = new Date(cy, cm, 0).getDate();
  const firstWeekday = new Date(cy, cm - 1, 1).getDay(); // 0 = Sunday
  const monthName = new Date(cy, cm - 1, 1).toLocaleString("en", {
    month: "long",
    year: "numeric",
  });
  const today = dateStr();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
          Ready Hub · {DEPT_DISPLAY}
        </h1>
        <p className="mt-1 text-slate-400">
          Daily unit coverage. Click any day in the calendar to inspect it.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Day detail */}
        <div className="space-y-4">
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : (
            <section
              className={`rounded-3xl border p-6 ${
                status === "Green"
                  ? "border-emerald/40 bg-emerald/10"
                  : status === "Red"
                  ? "border-red-400/40 bg-red-500/10"
                  : "glass border-transparent"
              }`}
            >
              <p className="mb-1 text-[11px] uppercase tracking-[3px] text-slate-400">
                {dateLabel(selectedDate)}
                {selectedDate === today && " · today"}
              </p>
              <p
                className={`text-4xl font-bold ${
                  status === "Green"
                    ? "text-emerald"
                    : status === "Red"
                    ? "text-red-300"
                    : "text-slate-300"
                }`}
              >
                {status === "Green"
                  ? "Green — covered"
                  : status === "Red"
                  ? "Red — shortage"
                  : status === "Awaiting"
                  ? "Awaiting sterilization"
                  : "No activity"}
              </p>
              {status !== "Blank" && (
                <p className="mt-2 text-sm text-slate-300">
                  {needed} {needed === 1 ? "unit" : "units"} needed
                  {provided !== null && ` · ${provided} provided`}
                  {status === "Red" && ` · gap of ${needed - (provided ?? 0)}`}
                </p>
              )}

              {status === "Red" && report && (
                <button
                  onClick={exportShortagePdf}
                  className="mt-3 rounded-lg border border-red-400/40 px-5 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/10"
                >
                  Download shortage report (PDF)
                </button>
              )}

              {counts.length > 0 && (
                <div className="mt-4 space-y-1 border-t border-white/10 pt-3">
                  <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">
                    Per-clinic patients
                  </p>
                  {counts
                    .slice()
                    .sort((a, b) =>
                      (clinicLabels.get(a.clinicId) ?? "").localeCompare(
                        clinicLabels.get(b.clinicId) ?? ""
                      )
                    )
                    .map((c) => (
                      <div key={c.id} className="flex items-center justify-between px-2 py-0.5">
                        <span className="text-sm text-slate-300">
                          {clinicLabels.get(c.clinicId) ?? c.clinicId}
                        </span>
                        <span className="text-sm font-semibold text-slate-200">{c.count}</span>
                      </div>
                    ))}
                </div>
              )}

              {report && (
                <p className="mt-3 border-t border-white/10 pt-3 text-xs text-slate-400">
                  Spares (informational): {report.extraHandpieces} high-speeds ·{" "}
                  {report.extraContraAngles} contra-angles · {report.extraHooks} hooks
                </p>
              )}
            </section>
          )}
        </div>

        {/* Month calendar */}
        <aside className="h-fit">
          <section className="glass rounded-3xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <button
                onClick={() => shiftMonth(-1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-slate-300 transition hover:text-white"
              >
                ‹
              </button>
              <h2 className="text-lg font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
                {monthName}
              </h2>
              <button
                onClick={() => shiftMonth(1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-slate-300 transition hover:text-white"
              >
                ›
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <span key={i} className="pb-1 text-[11px] text-slate-500">
                  {d}
                </span>
              ))}
              {Array.from({ length: firstWeekday }).map((_, i) => (
                <span key={`pad-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const date = `${calMonth}-${String(day).padStart(2, "0")}`;
                const rep = reportByDate.get(date);
                const isSelected = date === selectedDate;
                const isToday = date === today;
                return (
                  <button
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    className={`flex h-9 flex-col items-center justify-center rounded-lg text-sm transition ${
                      isSelected
                        ? "border border-emerald/60 bg-emerald/15 text-white"
                        : isToday
                        ? "border border-white/30 text-white"
                        : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <span>{day}</span>
                    {rep && (
                      <span
                        className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                          rep.status === "Green" ? "bg-emerald" : "bg-red-400"
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center gap-4 border-t border-white/10 pt-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald" /> Covered
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-400" /> Shortage
              </span>
              <span>No dot = no report</span>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}