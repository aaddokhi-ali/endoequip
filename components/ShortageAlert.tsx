// components/ShortageAlert.tsx
// Global red banner for admins: shows whenever TODAY has an unresolved
// sterilization shortage. In-app alerting (Spark plan — no email/push).
"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { dateStr, fetchShortages } from "@/lib/data/readyApi";

const DEPT = "endo";

export default function ShortageAlert() {
  const { appUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [gap, setGap] = useState<number | null>(null);

  useEffect(() => {
    if (appUser?.role !== "admin") return;
    const today = dateStr();
    fetchShortages(DEPT, today, today).then((reports) => {
      const active = reports.filter((r) => !r.resolved);
      setGap(active.length > 0 ? active.reduce((s, r) => s + r.gap, 0) : null);
    });
  }, [appUser, pathname]); // re-checks on every page change

  if (appUser?.role !== "admin" || gap === null) return null;

  return (
    <button
      onClick={() => router.push("/admin/ready")}
      className="w-full border-b border-red-400/40 bg-red-500/20 px-6 py-2.5 text-center text-sm font-semibold text-red-200 transition hover:bg-red-500/30"
    >
      ⚠ Sterilization shortage TODAY — {gap} {gap === 1 ? "unit" : "units"} uncovered. Click to
      view.
    </button>
  );
}