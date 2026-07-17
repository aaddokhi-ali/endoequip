// app/store/devices/page.tsx
"use client";
import RoleGuard from "@/components/RoleGuard";
import AppShell from "@/components/AppShell";
import DeviceManager from "@/components/DeviceManager";
import MaterialsManager from "@/components/MaterialsManager";
import EquipmentReport from "@/components/EquipmentReport";
export default function StoreDevicesPage() {
  return (
    <RoleGuard allow="store">
      <AppShell>
        <div className="space-y-12">
          <DeviceManager clinicId={null} canAdd={true} />
          <MaterialsManager clinicId={null} canEdit={false} />
          <EquipmentReport clinicId={null} />
        </div>
      </AppShell>
    </RoleGuard>
  );
}