// app/clinic/ready/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import RoleGuard from "@/components/RoleGuard";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/lib/hooks/useAuth";
import { PatientCount, ReadyReport } from "@/lib/types";
import {
  dateStr,
  dateLabel,
  setPatientCount,
  fetchClinicCount,
  fetchDeptCounts,
  fetchReadyReport,
  computeDisplayStatus,
  DayDisplayStatus,
} from "@/lib/data/readyApi";

export default function ClinicReadyPage() {
  return (
    <RoleGuard allow="clinic">
      <AppShell>
        <ClinicReady />
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
        . One complete unit is prepared per patient. Partial units never count — extras of
        individual components are informational only.
      </p>
    </div>
  );
}

function ClinicReady() {
  const { appUser } = useAuth();
  const clinicId = appUser?.clinicId ?? null;
  const departmentId = appUser?.departmentId ?? null;

  const [offset, setOffset] = useState(0);
  const [count, setCount] = useState<string>("");
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [deptCounts, setDeptCounts] = useState<PatientCount[]>([]);
  const [report, setReport] = useState<ReadyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const date = dateStr(offset);

  const load = useCallback(async () => {
    if (!clinicId || !departmentId) return;
    setLoading(true);
    const [mine, all, rep] = await Promise.all([
      fetchClinicCount(date, clinicId),
      fetchDeptCounts(date, departmentId),
      fetchReadyReport(date, departmentId),
    ]);
    setSavedCount(mine?.count ?? null);
    setCount(mine ? String(mine.count) : "");
    setDeptCounts(all);
    setReport(rep);
    setLoading(false);
  }, [clinicId, departmentId, date]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!clinicId || !departmentId || count === "") return;
    setSaving(true);
    await setPatientCount({
      date,
      departmentId,
      clinicId,
      count: Math.max(0, Number(count)),
    });
    await load();
    setSaving(false);
  }

  const { status, needed, provided } = computeDisplayStatus(deptCounts, report);
  const dirty = count !== "" && Number(count) !== savedCount;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
          Ready Hub
        </h1>
        <p className="mt-1 text-slate-400">
          Enter your patient count — sterilization prepares one unit per patient.
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
          {/* Count entry */}
          <section className="glass rounded-3xl p-6">
            <p className="mb-1 text-[11px] uppercase tracking-[3px] text-emerald/70">
              {dateLabel(date)}
            </p>
            <h2 className="mb-4 text-2xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
              How many patients?
            </h2>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                value={count}
                placeholder="0"
                onChange={(e) => setCount(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                className="w-28 rounded-xl border border-white/15 bg-(--color-navy) px-4 py-3 text-center text-3xl font-semibold text-white outline-none focus:border-emerald/60"
              />
              <button
                onClick={save}
                disabled={saving || !dirty}
                className="rounded-lg bg-emerald px-6 py-3 text-sm font-semibold text-(--color-navy) transition hover:bg-(--color-emerald-soft) disabled:opacity-50"
              >
                {saving ? "Saving…" : savedCount === null ? "Save" : "Update"}
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              {savedCount === null
                ? "No count entered for this day yet."
                : `Saved: ${savedCount} ${savedCount === 1 ? "patient" : "patients"}. You can update any time.`}
            </p>
          </section>

          {/* Department status */}
          <StatusCard status={status} needed={needed} provided={provided} report={report} />
        </div>
      )}
    </div>
  );
}

function StatusCard({
  status,
  needed,
  provided,
  report,
}: {
  status: DayDisplayStatus;
  needed: number;
  provided: number | null;
  report: ReadyReport | null;
}) {
  if (status === "Blank") {
    return (
      <section className="glass rounded-3xl p-6">
        <h2 className="mb-2 text-2xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
          Department status
        </h2>
        <p className="text-slate-400">No clinic has entered a count for this day yet.</p>
      </section>
    );
  }
  if (status === "Awaiting") {
    return (
      <section className="glass rounded-3xl p-6">
        <h2 className="mb-2 text-2xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
          Department status
        </h2>
        <p className="text-3xl font-semibold text-slate-300">Awaiting sterilization</p>
        <p className="mt-2 text-sm text-slate-400">
          {needed} {needed === 1 ? "unit" : "units"} needed so far. Sterilization hasn't
          responded yet.
        </p>
      </section>
    );
  }
  const green = status === "Green";
  const anyExtras =
    !!report &&
    (report.extraHandpieces > 0 || report.extraContraAngles > 0 || report.extraHooks > 0);
  return (
    <section
      className={`rounded-3xl border p-6 ${
        green ? "border-emerald/40 bg-emerald/10" : "border-red-400/40 bg-red-500/10"
      }`}
    >
      <h2 className="mb-2 text-2xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
        Department status
      </h2>
      <p className={`text-4xl font-bold ${green ? "text-emerald" : "text-red-300"}`}>
        {green ? "Green — covered" : "Red — shortage"}
      </p>
      <p className="mt-2 text-sm text-slate-300">
        {provided} {provided === 1 ? "unit" : "units"} provided for {needed} needed
        {!green && ` — gap of ${needed - (provided ?? 0)}`}.
      </p>

      {report && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">
            Spare components available (informational — not complete units)
          </p>
          {anyExtras ? (
            <p className="text-sm text-slate-300">
              {report.extraHandpieces} high-speed{report.extraHandpieces === 1 ? "" : "s"} ·{" "}
              {report.extraContraAngles} contra-angle{report.extraContraAngles === 1 ? "" : "s"} ·{" "}
              {report.extraHooks} hook{report.extraHooks === 1 ? "" : "s"}
            </p>
          ) : (
            <p className="text-sm text-slate-400">No spare components reported.</p>
          )}
        </div>
      )}
    </section>
  );
}