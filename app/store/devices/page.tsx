// app/store/devices/page.tsx
"use client";

import RoleGuard from "@/components/RoleGuard";
import AppShell from "@/components/AppShell";
import DeviceManager from "@/components/DeviceManager";

export default function StoreDevicesPage() {
  return (
    <RoleGuard allow="store">
      <AppShell>
        <DeviceManager clinicId={null} canAdd={true} />
      </AppShell>
    </RoleGuard>
  );
}