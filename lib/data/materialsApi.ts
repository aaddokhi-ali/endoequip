// lib/data/materialsApi.ts
"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { ClinicMaterials, MaterialStatus } from "@/lib/types";

/** Materials doc for one clinic. Null if the clinic has never saved a status. */
export async function fetchMaterialsForClinic(
  clinicId: string
): Promise<ClinicMaterials | null> {
  const snap = await getDoc(doc(db, "materials", clinicId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<ClinicMaterials, "id">) };
}

/** Materials docs for every clinic in a department (admin/store views + report). */
export async function fetchMaterialsForDepartment(
  departmentId: string
): Promise<ClinicMaterials[]> {
  const snap = await getDocs(
    query(collection(db, "materials"), where("departmentId", "==", departmentId))
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClinicMaterials, "id">) }));
}

/**
 * Set one item's status. Creates the clinic's doc on first write.
 * setDoc + merge deep-merges the statuses map, so updating one item
 * never wipes the others.
 */
export async function setMaterialStatus(args: {
  departmentId: string;
  clinicId: string;
  itemKey: string;
  status: MaterialStatus;
  updatedBy: string;
}): Promise<void> {
  await setDoc(
    doc(db, "materials", args.clinicId),
    {
      departmentId: args.departmentId,
      clinicId: args.clinicId,
      statuses: { [args.itemKey]: args.status },
      updatedAt: Timestamp.now(),
      updatedBy: args.updatedBy,
    },
    { merge: true }
  );
}