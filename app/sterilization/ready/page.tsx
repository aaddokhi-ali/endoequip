// app/sterilization/ready/page.tsx
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
  saveReadyReport,
  computeDisplayStatus,
} from "@/lib/data/readyApi";

const DEPT = "endo";
const DEPT_DISPLAY = "Endodontics";

export default function SterilizationReadyPage() {
  return (
    <RoleGuard allow="sterilization">
      <AppShell>
        <SterilizationReady />
      </AppShell>
    </RoleGuard>
  );
}

const DAY_TABS = [
  { offset: -1, label: "Yesterday" },
  { offset: 0, label: "Today" },
  { offset: 1, label: "Tomorrow" },
];

function UnitDefinitionNote() {
  return (
    <div className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3">
      <p className="text-sm text-sky-200">
        <span className="font-semibold">What is a unit?</span> One unit ={" "}
        <span className="font-semibold text-white">
          1 cassette + 1 high-speed + 1 contra-angle + 1 hook
        </span>
        . One complete unit is prepared per patient. Partial units never count toward
        Green/Red — spare components go in the extras fields below and are informational only.
      </p>
    </div>
  );
}

function SterilizationReady() {
  const [offset, setOffset] = useState(0);
  const [counts, setCounts] = useState<PatientCount[]>([]);
  const [report, setReport] = useState<ReadyReport | null>(null);
  const [clinicLabels, setClinicLabels] = useState<Map<string, string>>(new Map());
  const [provided, setProvided] = useState("");
  const [exH, setExH] = useState("0");
  const [exC, setExC] = useState("0");
  const [exK, setExK] = useState("0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const date = dateStr(offset);

  const load = useCallback(async () => {
    setLoading(true);
    const [all, rep, labels] = await Promise.all([
      fetchDeptCounts(date, DEPT),
      fetchReadyReport(date, DEPT),
      buildClinicLabels(),
    ]);
    setCounts(all);
    setReport(rep);
    setClinicLabels(labels);
    setProvided(rep ? String(rep.unitsProvided) : "");
    setExH(rep ? String(rep.extraHandpieces) : "0");
    setExC(rep ? String(rep.extraContraAngles) : "0");
    setExK(rep ? String(rep.extraHooks) : "0");
    setLoading(false);
  }, [date]);

  useEffect(() => {
    load();
    setNotice("");
  }, [load]);

  const needed = useMemo(() => counts.reduce((s, c) => s + c.count, 0), [counts]);
  const { status } = computeDisplayStatus(counts, report);

  async function save() {
    if (provided === "") return;
    setSaving(true);
    setNotice("");
    const result = await saveReadyReport({
      date,
      departmentId: DEPT,
      unitsNeeded: needed,
      unitsProvided: Math.max(0, Number(provided)),
      extraHandpieces: Math.max(0, Number(exH) || 0),
      extraContraAngles: Math.max(0, Number(exC) || 0),
      extraHooks: Math.max(0, Number(exK) || 0),
    });
    await load();
    setSaving(false);
    setNotice(
      result === "Green"
        ? "Saved — day is Green, all patients covered."
        : "Saved — day is RED. A shortage report has been recorded."
    );
  }

  function exportShortagePdf() {
    const gap = needed - (report?.unitsProvided ?? 0);
    const pdf = new jsPDF();
    const generated = new Date().toLocaleString("en-GB");

    pdf.setFontSize(16);
    pdf.text(`Sterilization Shortage Report — ${DEPT_DISPLAY}`, 14, 18);
    pdf.setFontSize(11);
    pdf.text(`Date: ${dateLabel(date)} (${date})`, 14, 26);
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

    pdf.save(`shortage-report-${DEPT}-${date}.pdf`);
  }

  const inputCls =
    "rounded-lg border border-white/15 bg-(--color-navy) px-3 py-2 text-center text-sm text-white outline-none focus:border-emerald/60";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
          Ready Hub · Sterilization
        </h1>
        <p className="mt-1 text-slate-400">
          Enter the complete units you can cover for the day's patients.
        </p>
      </div>

      <UnitDefinitionNote />

      <div className="flex gap-2">
        {DAY_TABS.map((t) => (
          <button
            key={t.offset}
            onClick={() => setOffset(t.offset)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              offset === t.offset
                ? "bg-emerald/20 text-emerald border border-emerald/40"
                : "border border-white/15 text-slate-300 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Demand */}
          <section className="glass rounded-3xl p-6">
            <p className="mb-1 text-[11px] uppercase tracking-[3px] text-emerald/70">
              {dateLabel(date)}
            </p>
            <h2 className="mb-1 text-2xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
              Units needed
            </h2>
            <p className="text-5xl font-bold text-white">{needed}</p>
            <p className="mb-4 mt-1 text-sm text-slate-400">
              from {counts.length} {counts.length === 1 ? "clinic" : "clinics"}
              {counts.length > 0 && " — counts may still rise during the day"}
            </p>
            {counts.length > 0 && (
              <div className="space-y-1 border-t border-white/10 pt-3">
                {counts
                  .slice()
                  .sort((a, b) =>
                    (clinicLabels.get(a.clinicId) ?? "").localeCompare(
                      clinicLabels.get(b.clinicId) ?? ""
                    )
                  )
                  .map((c) => (
                    <div key={c.id} className="flex items-center justify-between px-2 py-1">
                      <span className="text-sm text-slate-300">
                        {clinicLabels.get(c.clinicId) ?? c.clinicId}
                      </span>
                      <span className="text-sm font-semibold text-slate-200">{c.count}</span>
                    </div>
                  ))}
              </div>
            )}
          </section>

          {/* Response */}
          <section
            className={`rounded-3xl border p-6 ${
              status === "Green"
                ? "border-emerald/40 bg-emerald/10"
                : status === "Red"
                ? "border-red-400/40 bg-red-500/10"
                : "glass border-transparent"
            }`}
          >
            <h2 className="mb-4 text-2xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
              Units we can provide
            </h2>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                value={provided}
                placeholder="0"
                onChange={(e) => setProvided(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                className="w-28 rounded-xl border border-white/15 bg-(--color-navy) px-4 py-3 text-center text-3xl font-semibold text-white outline-none focus:border-emerald/60"
              />
              <button
                onClick={save}
                disabled={saving || provided === ""}
                className="rounded-lg bg-emerald px-6 py-3 text-sm font-semibold text-(--color-navy) transition hover:bg-(--color-emerald-soft) disabled:opacity-50"
              >
                {saving ? "Saving…" : report ? "Update" : "Save"}
              </button>
            </div>

            {status !== "Blank" && status !== "Awaiting" && (
              <p className={`mt-3 text-lg font-bold ${status === "Green" ? "text-emerald" : "text-red-300"}`}>
                {status === "Green"
                  ? "Green — covered"
                  : `Red — shortage of ${needed - (report?.unitsProvided ?? 0)}`}
              </p>
            )}
            {notice && <p className="mt-2 text-sm text-slate-300">{notice}</p>}

            {status === "Red" && report && (
              <button
                onClick={exportShortagePdf}
                className="mt-3 rounded-lg border border-red-400/40 px-5 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/10"
              >
                Download shortage report (PDF)
              </button>
            )}

            <div className="mt-5 border-t border-white/10 pt-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                Extras (informational — don't affect status)
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">High-speeds</label>
                  <input type="number" min={0} value={exH} onChange={(e) => setExH(e.target.value)} className={`w-full ${inputCls}`} />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">Contra-angles</label>
                  <input type="number" min={0} value={exC} onChange={(e) => setExC(e.target.value)} className={`w-full ${inputCls}`} />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">Hooks</label>
                  <input type="number" min={0} value={exK} onChange={(e) => setExK(e.target.value)} className={`w-full ${inputCls}`} />
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}