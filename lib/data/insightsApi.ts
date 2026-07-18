// lib/data/insightsApi.ts
// Data layer for the readiness insight. Components never touch Firestore
// directly — they go through here. Config lives in "insightsConfig",
// one doc per department (doc id = departmentId).

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config"; 
import { ClinicMaterials, Device } from "@/lib/types";
import { ReadinessConfig } from "@/lib/insights/readiness";

const CONFIG_COLLECTION = "insightsConfig";

export async function fetchReadinessConfig(
  departmentId: string
): Promise<ReadinessConfig | null> {
  const snap = await getDoc(doc(db, CONFIG_COLLECTION, departmentId));
  return snap.exists() ? (snap.data() as ReadinessConfig) : null;
}

export async function saveReadinessConfig(config: ReadinessConfig): Promise<void> {
  await setDoc(doc(db, CONFIG_COLLECTION, config.departmentId), {
    ...config,
    updatedAt: serverTimestamp(),
  });
}

/** All clinics' material status docs for a department. */
export async function fetchDepartmentMaterials(
  departmentId: string
): Promise<ClinicMaterials[]> {
  const q = query(
    collection(db, "materials"),
    where("departmentId", "==", departmentId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...(d.data() as ClinicMaterials), id: d.id }));
}

/** All registered devices for a department. */
export async function fetchDepartmentDevices(
  departmentId: string
): Promise<Device[]> {
  const q = query(
    collection(db, "devices"),
    where("departmentId", "==", departmentId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...(d.data() as Device), id: d.id }));
}