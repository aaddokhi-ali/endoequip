// app/clinic/devices/page.tsx
"use client";

import RoleGuard from "@/components/RoleGuard";
import AppShell from "@/components/AppShell";
import DeviceManager from "@/components/DeviceManager";
import { useAuth } from "@/lib/hooks/useAuth";

export default function ClinicDevicesPage() {
  const { appUser } = useAuth();
  return (
    <RoleGuard allow="clinic">
      <AppShell>
        <DeviceManager clinicId={appUser?.clinicId ?? null} canAdd={true} />
      </AppShell>
    </RoleGuard>
  );
}