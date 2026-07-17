// app/clinic/devices/page.tsx
"use client";
import RoleGuard from "@/components/RoleGuard";
import AppShell from "@/components/AppShell";
import DeviceManager from "@/components/DeviceManager";
import MaterialsManager from "@/components/MaterialsManager";
import EquipmentReport from "@/components/EquipmentReport";
import { useAuth } from "@/lib/hooks/useAuth";

export default function ClinicDevicesPage() {
  const { appUser } = useAuth();
  return (
    <RoleGuard allow="clinic">
      <AppShell>
        <div className="space-y-12">
          <DeviceManager clinicId={appUser?.clinicId ?? null} canAdd={true} />
          <MaterialsManager clinicId={appUser?.clinicId ?? null} canEdit={true} />
          <EquipmentReport clinicId={appUser?.clinicId ?? null} />
        </div>
      </AppShell>
    </RoleGuard>
  );
}