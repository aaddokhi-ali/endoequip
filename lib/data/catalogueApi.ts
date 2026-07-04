// lib/data/catalogueApi.ts
"use client";

import {
  collection,
  doc,
  getDocs,
  writeBatch,
  updateDoc,
  setDoc,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { CatalogueItem, ItemCategory } from "@/lib/types";

/** All catalogue items for a department (both active and inactive). */
export async function fetchCatalogue(departmentId: string): Promise<CatalogueItem[]> {
  const snap = await getDocs(
    query(collection(db, "catalogueItems"), where("departmentId", "==", departmentId))
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CatalogueItem, "id">) }));
}

/** How many items already exist for a department — used to prevent double-loading. */
export async function catalogueCount(departmentId: string): Promise<number> {
  const snap = await getDocs(
    query(collection(db, "catalogueItems"), where("departmentId", "==", departmentId))
  );
  return snap.size;
}

/**
 * Bulk-load catalogue items. Firestore batches cap at 500 writes, so we chunk.
 * Uses each item's own id, so re-running overwrites rather than duplicating.
 */
export async function bulkLoadCatalogue(items: CatalogueItem[]): Promise<number> {
  const CHUNK = 400;
  let written = 0;
  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const item of items.slice(i, i + CHUNK)) {
      const { id, ...data } = item;
      batch.set(doc(db, "catalogueItems", id), data);
    }
    await batch.commit();
    written += Math.min(CHUNK, items.length - i);
  }
  return written;
}

/** Rename a parent across every variant that shares its parentId. */
export async function renameParent(
  departmentId: string,
  parentId: string,
  newName: string
): Promise<void> {
  const snap = await getDocs(
    query(
      collection(db, "catalogueItems"),
      where("departmentId", "==", departmentId),
      where("parentId", "==", parentId)
    )
  );
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, { parentName: newName.trim() }));
  await batch.commit();
}

/** Toggle a single variant active/inactive (hide without deleting). */
export async function setVariantActive(itemId: string, active: boolean): Promise<void> {
  await updateDoc(doc(db, "catalogueItems", itemId), { active });
}

/** Toggle a whole parent (all its variants) active/inactive. */
export async function setParentActive(
  departmentId: string,
  parentId: string,
  active: boolean
): Promise<void> {
  const snap = await getDocs(
    query(
      collection(db, "catalogueItems"),
      where("departmentId", "==", departmentId),
      where("parentId", "==", parentId)
    )
  );
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, { active }));
  await batch.commit();
}

/**
 * True if a non-blank hospital code is already used by any item in this department.
 * Blank codes ("") are allowed to repeat — manual items may not have a code yet.
 */
export async function itemCodeExists(departmentId: string, code: string): Promise<boolean> {
  const trimmed = code.trim();
  if (!trimmed) return false;
  const snap = await getDocs(
    query(
      collection(db, "catalogueItems"),
      where("departmentId", "==", departmentId),
      where("itemCode", "==", trimmed)
    )
  );
  return !snap.empty;
}

/** Add a single new item (manual addition, blank itemCode allowed). */
export async function addCatalogueItem(item: Omit<CatalogueItem, "id">): Promise<void> {
  const id = `MAN-${Date.now()}`;
  await setDoc(doc(db, "catalogueItems", id), { ...item, createdAt: Timestamp.now() });
}

/**
 * Add a variant to an existing parent group.
 * Inherits department, parent identity, category, and subcategory from the group.
 * Throws if the hospital code is already in use.
 */
export async function addVariant(args: {
  departmentId: string;
  parentId: string;
  parentName: string;
  category: ItemCategory;
  subcategory: string;
  variantName: string;
  itemCode: string;
  unit: string;
}): Promise<void> {
  const code = args.itemCode.trim();
  if (await itemCodeExists(args.departmentId, code)) {
    throw new Error(`Hospital code "${code}" is already used by another item.`);
  }
  await addCatalogueItem({
    departmentId: args.departmentId,
    parentId: args.parentId,
    parentName: args.parentName,
    variantName: args.variantName.trim(),
    itemCode: code,
    category: args.category,
    subcategory: args.subcategory,
    unit: args.unit.trim() || "piece",
    active: true,
  });
}

/**
 * Create a brand-new parent group with its first variant.
 * Parents only exist through their items (groupByParent derives them),
 * so an empty parent is impossible — the first variant is created in the same step.
 */
export async function addParentWithFirstVariant(args: {
  departmentId: string;
  parentName: string;
  category: ItemCategory;
  subcategory: string;
  variantName: string;
  itemCode: string;
  unit: string;
}): Promise<void> {
  const code = args.itemCode.trim();
  if (await itemCodeExists(args.departmentId, code)) {
    throw new Error(`Hospital code "${code}" is already used by another item.`);
  }
  const parentId = `man-parent-${Date.now()}`;
  await addCatalogueItem({
    departmentId: args.departmentId,
    parentId,
    parentName: args.parentName.trim(),
    variantName: args.variantName.trim(),
    itemCode: code,
    category: args.category,
    subcategory: args.subcategory.trim() || "General",
    unit: args.unit.trim() || "piece",
    active: true,
  });
}