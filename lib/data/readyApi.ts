// lib/data/readyApi.ts
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
import { PatientCount, ReadyReport, ReadyStatus, ShortageReport } from "@/lib/types";

/** "2026-07-04" for today + offset days. */
export function dateStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** "2026-07-04" → "Saturday, 4 July". */
export function dateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Clinic sets its patient count for a date. 0 is meaningful (clinic closed / no patients). */
export async function setPatientCount(args: {
  date: string;
  departmentId: string;
  clinicId: string;
  count: number;
}): Promise<void> {
  await setDoc(doc(db, "patientCounts", `${args.clinicId}_${args.date}`), {
    date: args.date,
    departmentId: args.departmentId,
    clinicId: args.clinicId,
    count: Math.max(0, args.count),
    updatedAt: Timestamp.now(),
  });
}

/** One clinic's count for a date, or null. */
export async function fetchClinicCount(
  date: string,
  clinicId: string
): Promise<PatientCount | null> {
  const snap = await getDoc(doc(db, "patientCounts", `${clinicId}_${date}`));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<PatientCount, "id">) }) : null;
}

/** Every clinic's count in a department for a date. */
export async function fetchDeptCounts(
  date: string,
  departmentId: string
): Promise<PatientCount[]> {
  const snap = await getDocs(
    query(
      collection(db, "patientCounts"),
      where("date", "==", date),
      where("departmentId", "==", departmentId)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PatientCount, "id">) }));
}

/** The sterilization report for a date, or null if not entered yet. */
export async function fetchReadyReport(
  date: string,
  departmentId: string
): Promise<ReadyReport | null> {
  const snap = await getDoc(doc(db, "readyReports", `${departmentId}_${date}`));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<ReadyReport, "id">) }) : null;
}

/**
 * Sterilization saves (or revises) its numbers for a date.
 * Status is computed against the needed total at save time.
 * Red → a shortageReport is created/updated (kept forever).
 * Green after a previous Red → the shortage doc is marked resolved, never deleted.
 */
export async function saveReadyReport(args: {
  date: string;
  departmentId: string;
  unitsNeeded: number; // caller passes the current summed count
  unitsProvided: number;
  extraHandpieces: number;
  extraContraAngles: number;
  extraHooks: number;
}): Promise<ReadyStatus> {
  const status: ReadyStatus = args.unitsProvided >= args.unitsNeeded ? "Green" : "Red";

  await setDoc(doc(db, "readyReports", `${args.departmentId}_${args.date}`), {
    date: args.date,
    departmentId: args.departmentId,
    unitsProvided: Math.max(0, args.unitsProvided),
    extraHandpieces: Math.max(0, args.extraHandpieces),
    extraContraAngles: Math.max(0, args.extraContraAngles),
    extraHooks: Math.max(0, args.extraHooks),
    status,
    updatedAt: Timestamp.now(),
  });

  const shortageRef = doc(db, "shortageReports", `${args.departmentId}_${args.date}`);
  if (status === "Red") {
    await setDoc(
      shortageRef,
      {
        date: args.date,
        departmentId: args.departmentId,
        unitsNeeded: args.unitsNeeded,
        unitsProvided: Math.max(0, args.unitsProvided),
        gap: args.unitsNeeded - args.unitsProvided,
        resolved: false,
        pdfUrl: null,
        createdAt: Timestamp.now(),
      },
      { merge: true }
    );
  } else {
    const existing = await getDoc(shortageRef);
    if (existing.exists()) {
      await setDoc(shortageRef, { resolved: true }, { merge: true });
    }
  }

  return status;
}

/** Display status for a date: Green/Red once sterilization answered, otherwise awaiting/blank. */
export type DayDisplayStatus = "Green" | "Red" | "Awaiting" | "Blank";

export function computeDisplayStatus(
  counts: PatientCount[],
  report: ReadyReport | null
): { status: DayDisplayStatus; needed: number; provided: number | null } {
  const needed = counts.reduce((s, c) => s + c.count, 0);
  if (!report) {
    return { status: counts.length === 0 ? "Blank" : "Awaiting", needed, provided: null };
  }
  // Live recompute: clinics may have raised counts after sterilization saved.
  return {
    status: report.unitsProvided >= needed ? "Green" : "Red",
    needed,
    provided: report.unitsProvided,
  };
}

/** All shortage reports for a department in a date range (inclusive, "YYYY-MM-DD"). */
export async function fetchShortages(
  departmentId: string,
  startDate: string,
  endDate: string
): Promise<ShortageReport[]> {
  const snap = await getDocs(
    query(
      collection(db, "shortageReports"),
      where("departmentId", "==", departmentId),
      where("date", ">=", startDate),
      where("date", "<=", endDate)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ShortageReport, "id">) }));
}

/** All ready reports for a department in a date range (for the calendar). */
export async function fetchReadyReportsRange(
  departmentId: string,
  startDate: string,
  endDate: string
): Promise<ReadyReport[]> {
  const snap = await getDocs(
    query(
      collection(db, "readyReports"),
      where("departmentId", "==", departmentId),
      where("date", ">=", startDate),
      where("date", "<=", endDate)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReadyReport, "id">) }));
}