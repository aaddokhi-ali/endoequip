// lib/orderSummary.ts
// Shared "sum a month's orderItems into display lines" logic,
// used by both the admin Orders page and the store Orders page.

import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { CatalogueItem, OrderItem, Clinic, Department, clinicLabel } from "@/lib/types";

export interface ClinicShare {
  orderItemDocId: string;
  clinicLabel: string;
  quantity: number;
  dispatched: number | null; // null = store hasn't entered it yet
}

/** One catalogue item's summed order line. */
export interface SummedLine {
  item: CatalogueItem | undefined;
  catalogueItemId: string;
  total: number;
  totalDispatched: number; // sum of entered values (untouched lines count as 0)
  anyDispatchEntered: boolean;
  perClinic: ClinicShare[];
}

/** Collapse raw orderItems into per-item lines with per-clinic breakdown. */
export function summarizeOrder(
  orderItems: OrderItem[],
  catalogueById: Map<string, CatalogueItem>,
  clinicLabels: Map<string, string>
): SummedLine[] {
  const map = new Map<string, SummedLine>();
  for (const o of orderItems) {
    let line = map.get(o.catalogueItemId);
    if (!line) {
      line = {
        item: catalogueById.get(o.catalogueItemId),
        catalogueItemId: o.catalogueItemId,
        total: 0,
        totalDispatched: 0,
        anyDispatchEntered: false,
        perClinic: [],
      };
      map.set(o.catalogueItemId, line);
    }
    const dispatched =
      typeof o.dispatchedQuantity === "number" ? o.dispatchedQuantity : null;
    line.total += o.quantity;
    if (dispatched !== null) {
      line.totalDispatched += dispatched;
      line.anyDispatchEntered = true;
    }
    line.perClinic.push({
      orderItemDocId: o.id,
      clinicLabel: clinicLabels.get(o.clinicId) ?? o.clinicId,
      quantity: o.quantity,
      dispatched,
    });
  }
  const arr = [...map.values()];
  for (const l of arr) l.perClinic.sort((a, b) => a.clinicLabel.localeCompare(b.clinicLabel));
  arr.sort((a, b) => (a.item?.variantName ?? "").localeCompare(b.item?.variantName ?? ""));
  return arr;
}

/** clinicId → "ENDO258" for every clinic, one read of each collection. */
export async function buildClinicLabels(): Promise<Map<string, string>> {
  const [cSnap, dSnap] = await Promise.all([
    getDocs(collection(db, "clinics")),
    getDocs(collection(db, "departments")),
  ]);
  const deptCode = new Map<string, string>();
  dSnap.docs.forEach((d) => deptCode.set(d.id, (d.data() as Department).code));
  const labels = new Map<string, string>();
  cSnap.docs.forEach((c) => {
    const clinic = c.data() as Clinic;
    const code = deptCode.get(clinic.departmentId) ?? "";
    labels.set(c.id, code ? clinicLabel(code, clinic.number) : String(clinic.number));
  });
  return labels;
}

/** Map catalogue items by id for quick lookup. */
export function indexCatalogue(items: CatalogueItem[]): Map<string, CatalogueItem> {
  const m = new Map<string, CatalogueItem>();
  items.forEach((i) => m.set(i.id, i));
  return m;
}