// lib/catalogueGrouping.ts
import { CatalogueItem, ItemCategory } from "@/lib/types";

export interface ParentGroup {
  parentId: string;
  parentName: string;
  category: ItemCategory;
  subcategory: string;
  variants: CatalogueItem[];
  anyActive: boolean;
}

const CATEGORY_ORDER: Record<ItemCategory, number> = {
  Consumable: 0,
  "Reusable Instrument": 1,
  "Capital Equipment": 2,
};

/** Group flat catalogue items into parents, ordered by category then subcategory then name. */
export function groupByParent(items: CatalogueItem[]): ParentGroup[] {
  const map = new Map<string, ParentGroup>();
  for (const it of items) {
    let g = map.get(it.parentId);
    if (!g) {
      g = {
        parentId: it.parentId,
        parentName: it.parentName,
        category: it.category,
        subcategory: it.subcategory,
        variants: [],
        anyActive: false,
      };
      map.set(it.parentId, g);
    }
    g.variants.push(it);
    if (it.active) g.anyActive = true;
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.variants.sort((a, b) => a.variantName.localeCompare(b.variantName));
  }
  groups.sort(
    (a, b) =>
      CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] ||
      a.subcategory.localeCompare(b.subcategory) ||
      a.parentName.localeCompare(b.parentName)
  );
  return groups;
}

export const CATEGORIES: ItemCategory[] = [
  "Consumable",
  "Reusable Instrument",
  "Capital Equipment",
];
