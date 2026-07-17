// app/admin/devices/page.tsx
"use client";

import RoleGuard from "@/components/RoleGuard";
import AppShell from "@/components/AppShell";
import DeviceManager from "@/components/DeviceManager";

export default function AdminDevicesPage() {
  return (
    <RoleGuard allow="admin">
      <AppShell>
        <DeviceManager clinicId={null} canAdd={true} />
      </AppShell>
    </RoleGuard>
  );
}