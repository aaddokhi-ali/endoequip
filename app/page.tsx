// app/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { ROLE_HOME } from "@/lib/types";

export default function RootPage() {
  const router = useRouter();
  const { appUser, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (appUser) router.replace(ROLE_HOME[appUser.role]);
    else router.replace("/login");
  }, [appUser, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--color-navy)">
      <p className="text-sm text-slate-400">Loading…</p>
    </div>
  );
}
