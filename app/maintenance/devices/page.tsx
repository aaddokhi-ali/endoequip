// app/maintenance/devices/page.tsx
"use client";

import RoleGuard from "@/components/RoleGuard";
import AppShell from "@/components/AppShell";
import DeviceManager from "@/components/DeviceManager";

export default function MaintenanceDevicesPage() {
  return (
    <RoleGuard allow="maintenance">
      <AppShell>
        <DeviceManager clinicId={null} canAdd={true} />
      </AppShell>
    </RoleGuard>
  );
}