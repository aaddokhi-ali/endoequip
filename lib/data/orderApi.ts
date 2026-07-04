// lib/data/orderApi.ts
"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  writeBatch,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { OrderItem } from "@/lib/types";

/** "2026-07" for the given date (defaults to today). */
export function calendarMonth(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-07" → "2026-08" (handles year rollover). */
export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1); // month is 1-based here, so this lands on the NEXT month
  return calendarMonth(d);
}

// ---- Emergency cycle helpers ----
// A cycle id is either a plain month "2026-07" or an emergency "2026-07-S1".

export function isEmergency(cycleId: string): boolean {
  return cycleId.includes("-S");
}

/** "2026-07-S1" → "2026-07"; plain months pass through. */
export function baseMonth(cycleId: string): string {
  return cycleId.split("-S")[0];
}

/** "2026-07" → "July 2026"; "2026-07-S1" → "July 2026 — Emergency 1". */
export function cycleLabel(cycleId: string): string {
  const [y, m] = baseMonth(cycleId).split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleString("en", { month: "long", year: "numeric" });
  if (!isEmergency(cycleId)) return label;
  const n = cycleId.split("-S")[1];
  return `${label} — Emergency ${n}`;
}

/** Kept for backward compatibility; same as cycleLabel for plain months. */
export function monthLabel(month: string): string {
  return cycleLabel(month);
}

export interface EmergencyEntry {
  id: string;   // e.g. "2026-07-S1"
  open: boolean;
}

export interface CycleInfo {
  currentMonth: string;
  lastClosedMonth: string | null;
  emergencies: EmergencyEntry[];
}

/** Full cycle state for a department (regular cycle + emergency registry). */
export async function getCycleInfo(departmentId: string): Promise<CycleInfo> {
  const snap = await getDoc(doc(db, "orderCycles", departmentId));
  if (!snap.exists()) {
    return { currentMonth: calendarMonth(), lastClosedMonth: null, emergencies: [] };
  }
  const data = snap.data() as {
    currentMonth?: string;
    lastClosedMonth?: string;
    emergencies?: EmergencyEntry[];
  };
  return {
    currentMonth: data.currentMonth || calendarMonth(),
    lastClosedMonth: data.lastClosedMonth ?? null,
    emergencies: data.emergencies ?? [],
  };
}

/** The month clinics are currently ordering for (regular cycle only). */
export async function getCurrentCycleMonth(departmentId: string): Promise<string> {
  return (await getCycleInfo(departmentId)).currentMonth;
}

/**
 * Open an emergency order for a (usually closed) month.
 * Returns the new cycle id, e.g. "2026-07-S2".
 */
export async function openEmergency(month: string, departmentId: string): Promise<string> {
  const info = await getCycleInfo(departmentId);
  const existing = info.emergencies.filter((e) => baseMonth(e.id) === month).length;
  const id = `${month}-S${existing + 1}`;
  await setDoc(
    doc(db, "orderCycles", departmentId),
    {
      currentMonth: info.currentMonth,
      emergencies: [...info.emergencies, { id, open: true }],
    },
    { merge: true }
  );
  return id;
}

/**
 * Deterministic doc id: one row per clinic per item per cycle.
 * Setting a quantity twice updates the same doc — duplicates are impossible.
 */
export function orderItemId(cycleId: string, clinicId: string, catalogueItemId: string): string {
  return `${cycleId}_${clinicId}_${catalogueItemId}`;
}

/** Everything this clinic has added to the given cycle's order. */
export async function fetchClinicOrder(cycleId: string, clinicId: string): Promise<OrderItem[]> {
  const snap = await getDocs(
    query(
      collection(db, "orderItems"),
      where("month", "==", cycleId),
      where("clinicId", "==", clinicId)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrderItem, "id">) }));
}

/** Everything every clinic in a department has added for the given cycle. */
export async function fetchDepartmentOrder(
  cycleId: string,
  departmentId: string
): Promise<OrderItem[]> {
  const snap = await getDocs(
    query(
      collection(db, "orderItems"),
      where("month", "==", cycleId),
      where("departmentId", "==", departmentId)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrderItem, "id">) }));
}

/** Create or update one order line. Quantity <= 0 removes it instead. */
export async function setOrderQuantity(args: {
  month: string; // cycle id (plain month or emergency)
  departmentId: string;
  clinicId: string;
  catalogueItemId: string;
  quantity: number;
}): Promise<void> {
  const id = orderItemId(args.month, args.clinicId, args.catalogueItemId);
  if (args.quantity <= 0) {
    await deleteDoc(doc(db, "orderItems", id));
    return;
  }
  await setDoc(
    doc(db, "orderItems", id),
    {
      month: args.month,
      departmentId: args.departmentId,
      clinicId: args.clinicId,
      catalogueItemId: args.catalogueItemId,
      quantity: args.quantity,
      status: "open",
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

/** Remove one line from the clinic's order. */
export async function removeOrderItem(
  cycleId: string,
  clinicId: string,
  catalogueItemId: string
): Promise<void> {
  await deleteDoc(doc(db, "orderItems", orderItemId(cycleId, clinicId, catalogueItemId)));
}

/**
 * Close & Send for any cycle (regular month or emergency).
 * - Stamps every open orderItem for the cycle as "closed".
 * - Regular month: advances currentMonth to the next calendar month.
 * - Emergency: flips its registry entry to open:false; currentMonth untouched.
 */
export async function closeCycle(cycleId: string, departmentId: string): Promise<number> {
  const snap = await getDocs(
    query(
      collection(db, "orderItems"),
      where("month", "==", cycleId),
      where("departmentId", "==", departmentId),
      where("status", "==", "open")
    )
  );

  const CHUNK = 400;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + CHUNK)) {
      batch.update(d.ref, { status: "closed", updatedAt: Timestamp.now() });
    }
    await batch.commit();
  }

  // Update the cycle registry after items are safely closed.
  const info = await getCycleInfo(departmentId);
  if (isEmergency(cycleId)) {
    await setDoc(
      doc(db, "orderCycles", departmentId),
      {
        currentMonth: info.currentMonth,
        emergencies: info.emergencies.map((e) =>
          e.id === cycleId ? { ...e, open: false } : e
        ),
      },
      { merge: true }
    );
  } else {
    await setDoc(
      doc(db, "orderCycles", departmentId),
      {
        currentMonth: nextMonth(cycleId),
        lastClosedMonth: cycleId,
        lastClosedAt: Timestamp.now(),
        emergencies: info.emergencies,
      },
      { merge: true }
    );
  }

  return docs.length;
}

/** Store enters how much of an order line was actually dispatched. */
export async function setDispatchedQuantity(
  orderItemDocId: string,
  dispatched: number
): Promise<void> {
  await updateDoc(doc(db, "orderItems", orderItemDocId), {
    dispatchedQuantity: Math.max(0, dispatched),
    updatedAt: Timestamp.now(),
  });
}