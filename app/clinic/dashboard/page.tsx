// app/clinic/dashboard/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import RoleGuard from "@/components/RoleGuard";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/lib/hooks/useAuth";
import { PatientCount, ReadyReport, Clinic, Department, clinicLabel } from "@/lib/types";
import { getCycleInfo, fetchClinicOrder, cycleLabel } from "@/lib/data/orderApi";
import {
  dateStr,
  dateLabel,
  fetchClinicCount,
  fetchDeptCounts,
  fetchReadyReport,
  computeDisplayStatus,
} from "@/lib/data/readyApi";

export default function ClinicDashboardPage() {
  return (
    <RoleGuard allow="clinic">
      <AppShell>
        <ClinicDashboard />
      </AppShell>
    </RoleGuard>
  );
}

function ClinicDashboard() {
  const router = useRouter();
  const { appUser } = useAuth();
  const clinicId = appUser?.clinicId ?? null;
  const departmentId = appUser?.departmentId ?? null;

  const [label, setLabel] = useState("");
  const [myCount, setMyCount] = useState<PatientCount | null>(null);
  const [deptCounts, setDeptCounts] = useState<PatientCount[]>([]);
  const [report, setReport] = useState<ReadyReport | null>(null);
  const [currentCycle, setCurrentCycle] = useState("");
  const [openEmergencies, setOpenEmergencies] = useState<string[]>([]);
  const [orderItemCount, setOrderItemCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!clinicId || !departmentId) return;
    setLoading(true);
    try {
      const today = dateStr();
      const [mine, all, rep, info, cSnap, dSnap] = await Promise.all([
        fetchClinicCount(today, clinicId),
        fetchDeptCounts(today, departmentId),
        fetchReadyReport(today, departmentId),
        getCycleInfo(departmentId),
        getDoc(doc(db, "clinics", clinicId)),
        getDoc(doc(db, "departments", departmentId)),
      ]);
      const myOrder = await fetchClinicOrder(info.currentMonth, clinicId);
      setMyCount(mine);
      setDeptCounts(all);
      setReport(rep);
      setCurrentCycle(info.currentMonth);
      setOpenEmergencies(info.emergencies.filter((e) => e.open).map((e) => e.id));
      setOrderItemCount(myOrder.length);
      if (cSnap.exists() && dSnap.exists()) {
        setLabel(
          clinicLabel((dSnap.data() as Department).code, (cSnap.data() as Clinic).number)
        );
      }
    } catch (e) {
      console.error("Clinic dashboard load failed:", e);
    } finally {
      setLoading(false);
    }
  }, [clinicId, departmentId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-slate-400">Loading dashboard…</p>;
  }

  const { status, needed, provided } = computeDisplayStatus(deptCounts, report);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
          {label || "Clinic"}
        </h1>
        <p className="mt-1 text-slate-400">{dateLabel(dateStr())}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Today's Ready */}
        <button
          onClick={() => router.push("/clinic/ready")}
          className={`rounded-3xl border p-6 text-left transition hover:bg-white/5 ${
            status === "Green"
              ? "border-emerald/40 bg-emerald/10"
              : status === "Red"
              ? "border-red-400/40 bg-red-500/10"
              : "glass border-transparent"
          }`}
        >
          <p className="mb-1 text-[11px] uppercase tracking-[3px] text-emerald/70">
            Ready Hub · today
          </p>
          <h2
            className={`text-xl font-bold ${
              status === "Green"
                ? "text-emerald"
                : status === "Red"
                ? "text-red-300"
                : "text-slate-300"
            }`}
            style={{ fontFamily: "var(--font-display)" }}
          >
            {status === "Green"
              ? "Green — covered"
              : status === "Red"
              ? "Red — shortage"
              : status === "Awaiting"
              ? "Awaiting sterilization"
              : "No activity yet"}
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            {myCount === null ? (
              <span className="font-semibold text-amber-300">
                You haven't entered today's patient count — tap to enter it.
              </span>
            ) : (
              <>
                Your count: <span className="font-semibold text-white">{myCount.count}</span>
                {status !== "Blank" &&
                  ` · department needs ${needed}${provided !== null ? `, ${provided} provided` : ""}`}
              </>
            )}
          </p>
        </button>

        {/* My order */}
        <button
          onClick={() => router.push("/clinic/order")}
          className="glass rounded-3xl p-6 text-left transition hover:bg-white/5"
        >
          <p className="mb-1 text-[11px] uppercase tracking-[3px] text-emerald/70">Order Hub</p>
          <h2 className="text-xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
            {cycleLabel(currentCycle)}
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            {orderItemCount === 0
              ? "Your order is empty — tap to start adding items."
              : `${orderItemCount} ${orderItemCount === 1 ? "item" : "items"} in your order so far.`}
          </p>
          {openEmergencies.length > 0 && (
            <p className="mt-2 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-300">
              Emergency order open — tap to add urgent items
            </p>
          )}
        </button>
      </div>
    </div>
  );
}