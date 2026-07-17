// lib/data/devicesApi.ts
"use client";

import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Device, DeviceStatus, DeviceType } from "@/lib/types";

/** All devices for a department, across every clinic. */
export async function fetchDevices(departmentId: string): Promise<Device[]> {
  const snap = await getDocs(
    query(collection(db, "devices"), where("departmentId", "==", departmentId))
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Device, "id">) }));
}

/** Devices for a single clinic. */
export async function fetchDevicesForClinic(
  departmentId: string,
  clinicId: string
): Promise<Device[]> {
  const snap = await getDocs(
    query(
      collection(db, "devices"),
      where("departmentId", "==", departmentId),
      where("clinicId", "==", clinicId)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Device, "id">) }));
}

/** Add a new device. */
export async function addDevice(args: {
  departmentId: string;
  clinicId: string;
  type: DeviceType;
  customName: string;
  serialNumber: string;
  status: DeviceStatus;
  notes: string;
}): Promise<void> {
  const id = `dev-${Date.now()}`;
  await setDoc(doc(db, "devices", id), {
    departmentId: args.departmentId,
    clinicId: args.clinicId,
    type: args.type,
    customName: args.customName.trim(),
    serialNumber: args.serialNumber.trim(),
    status: args.status,
    notes: args.notes.trim(),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

/** Update an existing device's editable fields. */
export async function updateDevice(
  deviceId: string,
  fields: Partial<Pick<Device, "type" | "customName" | "serialNumber" | "status" | "notes">>
): Promise<void> {
  const clean: Record<string, unknown> = { updatedAt: Timestamp.now() };
  if (fields.type !== undefined) clean.type = fields.type;
  if (fields.customName !== undefined) clean.customName = fields.customName.trim();
  if (fields.serialNumber !== undefined) clean.serialNumber = fields.serialNumber.trim();
  if (fields.status !== undefined) clean.status = fields.status;
  if (fields.notes !== undefined) clean.notes = fields.notes.trim();
  await updateDoc(doc(db, "devices", deviceId), clean);
}

/** Quick status-only change (used by the inline status buttons). */
export async function setDeviceStatus(deviceId: string, status: DeviceStatus): Promise<void> {
  await updateDoc(doc(db, "devices", deviceId), { status, updatedAt: Timestamp.now() });
}

/** Remove a device (e.g. decommissioned / removed from the clinic). */
export async function deleteDevice(deviceId: string): Promise<void> {
  await deleteDoc(doc(db, "devices", deviceId));
}