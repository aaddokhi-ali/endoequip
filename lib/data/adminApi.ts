// lib/data/adminApi.ts
"use client";

import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { createAuthUserIsolated } from "@/lib/firebase/secondary";
import { AppUser, Clinic, Department, Role } from "@/lib/types";

/* ---------------- Setup / bootstrap ---------------- */

/** True if any user profile exists — used to lock the one-time setup page. */
export async function anyUserExists(): Promise<boolean> {
  const snap = await getDocs(collection(db, "users"));
  return !snap.empty;
}

/** Create the FIRST admin (bootstrap). Creates only the admin — no department/clinic seeding. */
export async function createFirstAdmin(params: {
  email: string;
  password: string;
  displayName: string;
}): Promise<void> {
  const uid = await createAuthUserIsolated(params.email, params.password);
  await writeUserProfile(uid, {
    email: params.email.trim(),
    displayName: params.displayName,
    role: "admin",
    clinicId: null,
    departmentId: null, // admin is hospital-wide
  });
}

/* ---------------- Users ---------------- */

/** Write a users/{uid} profile doc. Doc id ALWAYS equals the auth uid. */
export async function writeUserProfile(
  uid: string,
  data: {
    email: string;
    displayName: string;
    role: Role;
    clinicId: string | null;
    departmentId: string | null;
  }
): Promise<void> {
  await setDoc(doc(db, "users", uid), { ...data, createdAt: Timestamp.now() });
}

/**
 * Admin action: create a new user (auth account + matching profile doc).
 * Only clinic users carry a clinicId/departmentId; the rest are hospital-wide.
 */
export async function createUserWithRole(params: {
  email: string;
  password: string;
  displayName: string;
  role: Role;
  clinicId: string | null;
  departmentId: string | null;
}): Promise<string> {
  const isClinic = params.role === "clinic";
  const uid = await createAuthUserIsolated(params.email, params.password);
  await writeUserProfile(uid, {
    email: params.email.trim(),
    displayName: params.displayName,
    role: params.role,
    clinicId: isClinic ? params.clinicId : null,
    departmentId: isClinic ? params.departmentId : null,
  });
  return uid;
}

export async function fetchUsers(): Promise<AppUser[]> {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<AppUser, "uid">) }));
}

/* ---------------- Departments ---------------- */

export async function fetchDepartments(): Promise<Department[]> {
  const snap = await getDocs(collection(db, "departments"));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Department, "id">) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Create a department. Code is normalized to uppercase, no spaces (e.g. "endo" -> "ENDO"). */
export async function createDepartment(name: string, code: string): Promise<void> {
  const cleanCode = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!cleanCode) throw new Error("Department code required.");
  // Ensure the code is unique.
  const existing = await getDocs(
    query(collection(db, "departments"), where("code", "==", cleanCode))
  );
  if (!existing.empty) throw new Error(`Department code ${cleanCode} already exists.`);
  const id = cleanCode.toLowerCase();
  await setDoc(doc(db, "departments", id), {
    name: name.trim(),
    code: cleanCode,
    createdAt: Timestamp.now(),
  });
}

export async function renameDepartment(id: string, name: string): Promise<void> {
  await updateDoc(doc(db, "departments", id), { name: name.trim() });
}

/* ---------------- Clinics ---------------- */

export async function fetchClinics(departmentId?: string): Promise<Clinic[]> {
  const base = collection(db, "clinics");
  const snap = departmentId
    ? await getDocs(query(base, where("departmentId", "==", departmentId)))
    : await getDocs(base);
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Clinic, "id">) }))
    .sort((a, b) => a.number - b.number);
}

/**
 * Create a clinic under a department using its REAL room number.
 * Clinic numbers are globally unique across the whole facility (hotel-room style),
 * so we check uniqueness across ALL clinics, not just the department.
 */
export async function createClinic(params: {
  departmentId: string;
  number: number;
  name?: string;
}): Promise<void> {
  if (!Number.isFinite(params.number) || params.number <= 0) {
    throw new Error("Enter a valid clinic number.");
  }
  const all = await getDocs(collection(db, "clinics"));
  const clash = all.docs.find((d) => (d.data() as Clinic).number === params.number);
  if (clash) throw new Error(`Clinic number ${params.number} already exists.`);

  const id = `clinic-${params.number}`; // number is globally unique, so this id is safe
  await setDoc(doc(db, "clinics", id), {
    number: params.number,
    departmentId: params.departmentId,
    name: params.name?.trim() || null,
    createdAt: Timestamp.now(),
  });
}
