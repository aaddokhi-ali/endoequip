// app/sterilization/dashboard/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import RoleGuard from "@/components/RoleGuard";
import AppShell from "@/components/AppShell";
import { PatientCount, ReadyReport } from "@/lib/types";
import {
  dateStr,
  dateLabel,
  fetchDeptCounts,
  fetchReadyReport,
  computeDisplayStatus,
} from "@/lib/data/readyApi";

const DEPT = "endo";

export default function SterilizationDashboardPage() {
  return (
    <RoleGuard allow="sterilization">
      <AppShell>
        <SterilizationDashboard />
      </AppShell>
    </RoleGuard>
  );
}

function SterilizationDashboard() {
  const router = useRouter();
  const [todayCounts, setTodayCounts] = useState<PatientCount[]>([]);
  const [todayReport, setTodayReport] = useState<ReadyReport | null>(null);
  const [ydayCounts, setYdayCounts] = useState<PatientCount[]>([]);
  const [ydayReport, setYdayReport] = useState<ReadyReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const today = dateStr();
      const yday = dateStr(-1);
      const [tc, tr, yc, yr] = await Promise.all([
        fetchDeptCounts(today, DEPT),
        fetchReadyReport(today, DEPT),
        fetchDeptCounts(yday, DEPT),
        fetchReadyReport(yday, DEPT),
      ]);
      setTodayCounts(tc);
      setTodayReport(tr);
      setYdayCounts(yc);
      setYdayReport(yr);
    } catch (e) {
      console.error("Sterilization dashboard load failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-slate-400">Loading dashboard…</p>;
  }

  const today = computeDisplayStatus(todayCounts, todayReport);
  const yday = computeDisplayStatus(ydayCounts, ydayReport);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
          Sterilization dashboard
        </h1>
        <p className="mt-1 text-slate-400">{dateLabel(dateStr())}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Today */}
        <button
          onClick={() => router.push("/sterilization/ready")}
          className={`rounded-3xl border p-6 text-left transition hover:bg-white/5 ${
            today.status === "Green"
              ? "border-emerald/40 bg-emerald/10"
              : today.status === "Red"
              ? "border-red-400/40 bg-red-500/10"
              : "glass border-transparent"
          }`}
        >
          <p className="mb-1 text-[11px] uppercase tracking-[3px] text-emerald/70">Today</p>
          <h2
            className={`text-xl font-bold ${
              today.status === "Green"
                ? "text-emerald"
                : today.status === "Red"
                ? "text-red-300"
                : "text-slate-300"
            }`}
            style={{ fontFamily: "var(--font-display)" }}
          >
            {today.status === "Green"
              ? "Green — covered"
              : today.status === "Red"
              ? "Red — shortage"
              : today.status === "Awaiting"
              ? `${today.needed} units needed — enter your response`
              : "No patient counts yet"}
          </h2>
          {today.status !== "Blank" && (
            <p className="mt-2 text-sm text-slate-300">
              {today.needed} needed
              {today.provided !== null && ` · ${today.provided} provided`}
              {today.status === "Red" && ` · gap of ${today.needed - (today.provided ?? 0)}`}
              {today.status === "Awaiting" && " · tap to respond"}
            </p>
          )}
        </button>

        {/* Yesterday */}
        <div className="glass rounded-3xl p-6">
          <p className="mb-1 text-[11px] uppercase tracking-[3px] text-emerald/70">Yesterday</p>
          <h2
            className={`text-xl font-bold ${
              yday.status === "Green"
                ? "text-emerald"
                : yday.status === "Red"
                ? "text-red-300"
                : "text-slate-300"
            }`}
            style={{ fontFamily: "var(--font-display)" }}
          >
            {yday.status === "Green"
              ? "Green — covered"
              : yday.status === "Red"
              ? "Red — shortage"
              : "No report"}
          </h2>
          {yday.status !== "Blank" && yday.status !== "Awaiting" && (
            <p className="mt-2 text-sm text-slate-300">
              {yday.needed} needed · {yday.provided} provided
            </p>
          )}
        </div>
      </div>
    </div>
  );
}