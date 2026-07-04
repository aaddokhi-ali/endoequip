// components/RoleGuard.tsx
"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { Role, ROLE_HOME } from "@/lib/types";

/**
 * Wrap a dashboard so only the right role can see it.
 * - Not logged in → /login
 * - Logged in as the wrong role → their own dashboard (no dead-ends)
 * - Right role → render children
 */
export default function RoleGuard({
  allow,
  children,
}: {
  allow: Role;
  children: ReactNode;
}) {
  const router = useRouter();
  const { appUser, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!appUser) {
      router.replace("/login");
      return;
    }
    if (appUser.role !== allow) {
      router.replace(ROLE_HOME[appUser.role]);
    }
  }, [appUser, loading, allow, router]);

  if (loading || !appUser || appUser.role !== allow) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--color-navy)">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  return <>{children}</>;
}
