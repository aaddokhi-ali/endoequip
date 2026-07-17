// app/admin/devices/page.tsx
"use client";
import RoleGuard from "@/components/RoleGuard";
import AppShell from "@/components/AppShell";
import DeviceManager from "@/components/DeviceManager";
import MaterialsManager from "@/components/MaterialsManager";
import EquipmentReport from "@/components/EquipmentReport";
export default function AdminDevicesPage() {
  return (
    <RoleGuard allow="admin">
      <AppShell>
        <div className="space-y-12">
          <DeviceManager clinicId={null} canAdd={true} />
          <MaterialsManager clinicId={null} canEdit={true} />
          <EquipmentReport clinicId={null} />
        </div>
      </AppShell>
    </RoleGuard>
  );
}