// app/admin/catalogue/page.tsx
"use client";

import RoleGuard from "@/components/RoleGuard";
import AppShell from "@/components/AppShell";
import CatalogueManager from "@/components/CatalogueManager";

export default function AdminCataloguePage() {
  return (
    <RoleGuard allow="admin">
      <AppShell>
        <CatalogueManager allowLoader={true} />
      </AppShell>
    </RoleGuard>
  );
}