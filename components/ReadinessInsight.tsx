// components/ReadinessInsight.tsx
// The readiness insight section for the Admin Insights page.
// The admin enters every operating number into an editable, persisted config
// (no defaults anywhere in code); the engine estimates per-driver demand,
// overlays live material/device statuses, and ranks the clinics.

"use client";

import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Clinic,
  ClinicMaterials,
  Device,
} from "@/lib/types";
import {
  ReadinessConfig,
  ReadinessResult,
  ClinicAssessment,
  Driver,
  DRIVER_LABEL,
  VERDICT_LABEL,
  computeReadiness,
  validateConfig,
} from "@/lib/insights/readiness";
import { fetchClinics } from "@/lib/data/adminApi";
import {
  fetchDepartmentDevices,
  fetchDepartmentMaterials,
  fetchReadinessConfig,
  saveReadinessConfig,
} from "@/lib/data/insightsApi";

// ---- form plumbing (strings in, numbers out) ----

type FormState = Record<string, string>;

const REQUIRED_FIELDS: Array<{ key: string; label: string; hint: string }> = [
  { key: "casesPerMonth", label: "Total cases / month", hint: "The anchor — everything scales from this" },
  { key: "visitsPerCase", label: "Visits per case", hint: "Average visits to complete one case" },
  { key: "initialPct", label: "Initial cases %", hint: "Must sum to 100 with retreatment" },
  { key: "retreatmentPct", label: "Retreatment cases %", hint: "Must sum to 100 with initial" },
  { key: "obturationPct", label: "Cases reaching obturation %", hint: "Share of cases obturated this month" },
  { key: "medicationPct", label: "Cases medicated %", hint: "Share getting an intra-canal dressing" },
];

const REFERENCE_FIELDS: Array<{ key: string; label: string }> = [
  { key: "patientsPerDay", label: "Patients / day" },
  { key: "workingDaysPerMonth", label: "Working days / month" },
  { key: "clinicCount", label: "Number of clinics" },
];

const EMPTY_FORM: FormState = Object.fromEntries(
  [...REQUIRED_FIELDS, ...REFERENCE_FIELDS].map((f) => [f.key, ""])
);

function toNum(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function configToForm(c: ReadinessConfig): FormState {
  return {
    casesPerMonth: String(c.casesPerMonth),
    visitsPerCase: String(c.visitsPerCase),
    initialPct: String(c.initialPct),
    retreatmentPct: String(c.retreatmentPct),
    obturationPct: String(c.obturationPct),
    medicationPct: String(c.medicationPct),
    patientsPerDay: c.patientsPerDay != null ? String(c.patientsPerDay) : "",
    workingDaysPerMonth: c.workingDaysPerMonth != null ? String(c.workingDaysPerMonth) : "",
    clinicCount: c.clinicCount != null ? String(c.clinicCount) : "",
  };
}

function buildConfig(
  form: FormState,
  departmentId: string
): { config: ReadinessConfig | null; errors: string[] } {
  const candidate: Partial<ReadinessConfig> = {
    departmentId,
    casesPerMonth: toNum(form.casesPerMonth) ?? undefined,
    visitsPerCase: toNum(form.visitsPerCase) ?? undefined,
    initialPct: toNum(form.initialPct) ?? undefined,
    retreatmentPct: toNum(form.retreatmentPct) ?? undefined,
    obturationPct: toNum(form.obturationPct) ?? undefined,
    medicationPct: toNum(form.medicationPct) ?? undefined,
    patientsPerDay: toNum(form.patientsPerDay),
    workingDaysPerMonth: toNum(form.workingDaysPerMonth),
    clinicCount: toNum(form.clinicCount),
  };
  const errors = validateConfig(candidate);
  return { config: errors.length === 0 ? (candidate as ReadinessConfig) : null, errors };
}

function clinicName(c: Clinic): string {
  return c.name?.trim() ? c.name : `Clinic ${c.number}`;
}

// ---- component ----

export default function ReadinessInsight({ departmentId }: { departmentId: string }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [config, setConfig] = useState<ReadinessConfig | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [materials, setMaterials] = useState<ClinicMaterials[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [cfg, cls, mats, devs] = await Promise.all([
        fetchReadinessConfig(departmentId),
        fetchClinics(departmentId),
        fetchDepartmentMaterials(departmentId),
        fetchDepartmentDevices(departmentId),
      ]);
      if (cfg) {
        setForm(configToForm(cfg));
        setConfig(cfg);
      }
      setClinics(cls);
      setMaterials(mats);
      setDevices(devs);
      setLoading(false);
    })();
  }, [departmentId]);

  const result: ReadinessResult | null = useMemo(() => {
    if (!config || clinics.length === 0) return null;
    return computeReadiness(config, clinics, materials, devices);
  }, [config, clinics, materials, devices]);

  async function handleSave() {
    setSavedMsg("");
    const { config: parsed, errors: errs } = buildConfig(form, departmentId);
    setErrors(errs);
    if (!parsed) return;
    setSaving(true);
    try {
      await saveReadinessConfig(parsed);
      setConfig(parsed);
      setSavedMsg("Configuration saved — analysis updated below.");
    } catch {
      setErrors(["Saving failed. Check the insightsConfig Firestore rule is published."]);
    } finally {
      setSaving(false);
    }
  }

  function setField(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  if (loading) {
    return (
      <section className="glass rounded-3xl p-6">
        <p className="text-sm text-slate-400">Loading readiness data…</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Config */}
      <section className="glass rounded-3xl p-6">
        <h2 className="mb-1 text-xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
          Clinic readiness
        </h2>
        <p className="mb-5 text-sm text-slate-400">
          Enter your department&apos;s operating numbers. Nothing is pre-filled —
          every figure is yours, editable anytime, and stored per department.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {REQUIRED_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">{f.label}</span>
              <input
                type="number"
                inputMode="decimal"
                value={form[f.key]}
                onChange={(e) => setField(f.key, e.target.value)}
                placeholder="Required"
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-400/50 focus:outline-none"
              />
              <span className="mt-0.5 block text-[11px] text-slate-500">{f.hint}</span>
            </label>
          ))}
        </div>

        <p className="mt-4 mb-2 text-[11px] uppercase tracking-wide text-slate-500">
          Reference only (shown in the report, not used in calculations)
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {REFERENCE_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">{f.label}</span>
              <input
                type="number"
                inputMode="decimal"
                value={form[f.key]}
                onChange={(e) => setField(f.key, e.target.value)}
                placeholder="Optional"
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-400/50 focus:outline-none"
              />
            </label>
          ))}
        </div>

        {errors.length > 0 && (
          <ul className="mt-4 space-y-1">
            {errors.map((e) => (
              <li key={e} className="text-sm text-red-300">• {e}</li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-emerald-500/20 px-5 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save & analyze"}
          </button>
          {result && config && (
            <button
              onClick={() => exportReadinessPdf(config, result)}
              className="rounded-xl border border-white/15 px-5 py-2 text-sm font-semibold text-white hover:bg-white/5"
            >
              Export detailed PDF
            </button>
          )}
          {savedMsg && <span className="text-sm text-emerald-300">{savedMsg}</span>}
        </div>
      </section>

      {/* Demand estimates */}
      {result && (
        <section className="glass rounded-3xl p-6">
          <h3 className="mb-1 text-lg font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
            Estimated monthly demand by driver
          </h3>
          <p className="mb-4 text-sm text-slate-400">
            Derived entirely from your inputs: {result.monthlyVisits} visits/month
            across {result.clinics.length} clinics.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(Object.keys(DRIVER_LABEL) as Driver[]).map((d) => (
              <div key={d} className="rounded-2xl border border-white/10 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">{DRIVER_LABEL[d]}</p>
                <p className="text-2xl font-semibold text-white">{result.demandByDriver[d]}</p>
                <p className="text-[11px] text-slate-500">est. cases or visits / month</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Ranked clinic verdicts */}
      {result && (
        <section className="glass rounded-3xl p-6">
          <h3 className="mb-1 text-lg font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
            Clinic readiness — ranked worst first
          </h3>
          <p className="mb-4 text-sm text-slate-400">
            Live material and device statuses overlaid on the demand model.
          </p>
          <div className="space-y-3">
            {result.clinics.map((a) => (
              <ClinicCard key={a.clinic.id} a={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: ClinicAssessment["verdict"] }) {
  const cls =
    verdict === "ready"
      ? "bg-emerald-500/15 text-emerald-300"
      : verdict === "at_risk"
      ? "bg-amber-500/15 text-amber-300"
      : "bg-red-500/15 text-red-300";
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

function ClinicCard({ a }: { a: ClinicAssessment }) {
  return (
    <div className="rounded-2xl border border-white/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{clinicName(a.clinic)}</p>
        <VerdictBadge verdict={a.verdict} />
      </div>

      {a.hardStops.map((h) => (
        <p key={h.deviceType} className="mt-2 text-sm text-red-300">
          ⛔ {h.deviceType} not working — {h.blockedStep} is blocked for every case.
        </p>
      ))}

      {a.criticalShortages.map((s) => (
        <p key={s.item.key} className="mt-2 text-sm text-red-300">
          ⚠ {s.item.label} — shortage of an always-stock item (needed at a
          non-skippable step, regardless of volume).
        </p>
      ))}

      {a.deviceWarnings.map((w) => (
        <p key={w} className="mt-2 text-sm text-amber-300">△ {w}</p>
      ))}

      {a.missingBlockingDevices.map((t) => (
        <p key={t} className="mt-2 text-sm text-amber-300">
          △ No {t} registered for this clinic — add it to the device register.
        </p>
      ))}

      {a.shortages.length > 0 && (
        <div className="mt-3 space-y-1">
          {a.shortages.map((s) => (
            <div key={s.item.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-200">{s.item.label}</span>
              <span className="shrink-0 text-xs text-slate-400">
                {DRIVER_LABEL[s.driver]} · ~{s.monthlyDemand}/mo
              </span>
            </div>
          ))}
        </div>
      )}

      {a.verdict === "ready" && (
        <p className="mt-2 text-sm text-slate-300">
          No shortages or device blocks reported.
        </p>
      )}

      {a.unreportedCount > 0 && (
        <p className="mt-2 text-[11px] text-slate-500">
          {a.unreportedCount} item{a.unreportedCount === 1 ? "" : "s"} marked
          N/A (not reported or not applicable) — not counted against readiness.
        </p>
      )}
    </div>
  );
}

// ---- PDF export ----

function exportReadinessPdf(config: ReadinessConfig, result: ReadinessResult) {
  const doc = new jsPDF();
  const today = new Date().toISOString().slice(0, 10);
  const lastY = () =>
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 20;

  doc.setFontSize(16);
  doc.text("Clinic Readiness Report", 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`Department: ${config.departmentId}    Generated: ${today}`, 14, 22);
  doc.setTextColor(0);

  const refRows: string[][] = [];
  if (config.patientsPerDay != null)
    refRows.push(["Patients / day (reference)", String(config.patientsPerDay)]);
  if (config.workingDaysPerMonth != null)
    refRows.push(["Working days / month (reference)", String(config.workingDaysPerMonth)]);
  if (config.clinicCount != null)
    refRows.push(["Number of clinics (reference)", String(config.clinicCount)]);

  autoTable(doc, {
    startY: 28,
    head: [["Operating input (admin-entered)", "Value"]],
    body: [
      ["Total cases / month", String(config.casesPerMonth)],
      ["Visits per case", String(config.visitsPerCase)],
      ["Initial / Retreatment split", `${config.initialPct}% / ${config.retreatmentPct}%`],
      ["Cases reaching obturation", `${config.obturationPct}%`],
      ["Cases medicated between visits", `${config.medicationPct}%`],
      ...refRows,
    ],
    styles: { fontSize: 9 },
    theme: "grid",
  });

  autoTable(doc, {
    startY: lastY() + 6,
    head: [["Demand driver", "Estimated monthly volume"]],
    body: [
      ["Every case", String(result.demandByDriver.all_cases)],
      ["Retreatment cases", String(result.demandByDriver.retreatment)],
      ["Obturation visits", String(result.demandByDriver.obturation)],
      ["Medication visits", String(result.demandByDriver.medication)],
      ["Total visits / month (derived)", String(result.monthlyVisits)],
    ],
    styles: { fontSize: 9 },
    theme: "grid",
  });

  for (const a of result.clinics) {
    let y = lastY() + 10;
    if (y > 255) {
      doc.addPage();
      y = 16;
    }
    doc.setFontSize(12);
    doc.text(`${clinicName(a.clinic)} — ${VERDICT_LABEL[a.verdict]}`, 14, y);

    const rows: string[][] = [];
    for (const h of a.hardStops)
      rows.push(["HARD STOP", `${h.deviceType} not working — ${h.blockedStep} blocked`]);
    for (const s of a.criticalShortages)
      rows.push(["CRITICAL", `${s.item.label} — always-stock item in shortage`]);
    for (const w of a.deviceWarnings) rows.push(["Warning", w]);
    for (const t of a.missingBlockingDevices)
      rows.push(["Warning", `No ${t} registered`]);
    for (const s of a.shortages)
      rows.push([
        "Shortage",
        `${s.item.label} — driver: ${DRIVER_LABEL[s.driver]}, ~${s.monthlyDemand}/mo`,
      ]);
    if (rows.length === 0)
      rows.push(["Ready", "No shortages or device blocks reported"]);
    if (a.unreportedCount > 0)
      rows.push(["Note", `${a.unreportedCount} item(s) marked N/A — not counted`]);

    autoTable(doc, {
      startY: y + 3,
      head: [["Finding", "Detail"]],
      body: rows,
      styles: { fontSize: 9 },
      theme: "grid",
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 0) {
          const v = String(data.cell.raw);
          if (v === "HARD STOP" || v === "CRITICAL") data.cell.styles.textColor = [200, 30, 30];
          else if (v === "Warning" || v === "Shortage") data.cell.styles.textColor = [180, 120, 0];
          else if (v === "Ready") data.cell.styles.textColor = [20, 130, 80];
        }
      },
    });
  }

  doc.save(`readiness-report-${today}.pdf`);
}