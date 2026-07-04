// app/store/catalogue/page.tsx
"use client";

import RoleGuard from "@/components/RoleGuard";
import AppShell from "@/components/AppShell";
import CatalogueManager from "@/components/CatalogueManager";

export default function StoreCataloguePage() {
  return (
    <RoleGuard allow="store">
      <AppShell>
        <CatalogueManager allowLoader={false} />
      </AppShell>
    </RoleGuard>
  );
}