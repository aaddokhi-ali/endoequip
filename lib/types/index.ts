// lib/types/index.ts
// The data model — mirrors EndoEquip_Schema_Reference.md section 5.
// Keep this file and the schema doc in agreement.

import { Timestamp } from "firebase/firestore";

export type Role = "clinic" | "store" | "sterilization" | "admin" | "maintenance";

/** A grouping unit. One at launch (Endodontics); schema supports many. */
export interface Department {
  id: string;
  name: string;
  code: string;        // short uppercase prefix, e.g. "ENDO" — used to compose clinic IDs
  createdAt?: Timestamp;
}

/** A clinic belongs to exactly one department. Identified by its real room number. */
export interface Clinic {
  id: string;
  number: number;        // the actual, globally-unique room number, e.g. 258
  departmentId: string;  // the grouping key
  name?: string;         // optional friendly name; the code label is the identifier
  createdAt?: Timestamp;
}

/** Compose a clinic's display identifier from its department code + number, e.g. "ENDO258". */
export function clinicLabel(departmentCode: string, clinicNumber: number): string {
  return `${departmentCode}${clinicNumber}`;
}

/**
 * One per auth account. The Firestore doc id MUST equal the Firebase Auth uid.
 * A missing or mismatched doc is what caused the old login bounce — never let
 * an account exist in Auth without a matching users/{uid} doc here.
 */
export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  clinicId: string | null;      // set ONLY when role === "clinic"
  departmentId: string | null;  // set ONLY for clinic users; null = hospital-wide (store/sterilization/admin)
  createdAt?: Timestamp;
}

export type ItemCategory = "Consumable" | "Reusable Instrument" | "Capital Equipment";

/** Collapsed catalogue: parents are browsed, variants are the real SKUs. */
export interface CatalogueItem {
  id: string;
  departmentId: string;   // which department's catalogue this belongs to (all "endo" today; ready for more)
  parentId: string;
  parentName: string;
  variantName: string;
  itemCode: string;       // hospital code; "" for manually-added items
  category: ItemCategory;
  subcategory: string;
  unit: string;           // box / piece / syringe / set / device ...
  active: boolean;
}

export type OrderItemStatus = "open" | "closed";

/** Order Hub: one row per clinic per item per month. Summed for display. */
export interface OrderItem {
  id: string;
  month: string;            // "2026-07"
  departmentId: string;
  clinicId: string;
  catalogueItemId: string;  // FK to a CatalogueItem variant
  quantity: number;
  dispatchedQuantity?: number | null;  // store-entered fulfillment; null/absent = not yet dispatched
  status: OrderItemStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** Ready Hub: one row per clinic per day. Suggested id: `${clinicId}_${date}`. */
export interface PatientCount {
  id: string;
  date: string;           // "2026-07-01"
  departmentId: string;
  clinicId: string;
  count: number;          // patients today = units this clinic needs
  updatedAt?: Timestamp;
}

export type ReadyStatus = "Green" | "Red";

/** Ready Hub: one row per department per day. Suggested id: `${departmentId}_${date}`. */
export interface ReadyReport {
  id: string;
  date: string;
  departmentId: string;
  unitsProvided: number;    // complete units sterilization can cover
  extraHandpieces: number;  // informational only
  extraContraAngles: number;// informational only
  extraHooks: number;       // informational only
  status: ReadyStatus;      // computed: provided >= needed
  updatedAt?: Timestamp;
}

/** Auto-created on every Red. The monthly weakness report aggregates these. */
export interface ShortageReport {
  id: string;
  date: string;
  departmentId: string;
  unitsNeeded: number;
  unitsProvided: number;
  gap: number;
  resolved?: boolean;    // true if a later revision turned the day Green
  pdfUrl: string | null;
  createdAt?: Timestamp;
}

// ---- The Unit definition (Ready Hub atom) ----
// 1 Unit = 1 cassette + 1 high-speed + 1 contra-angle + 1 hook.
// Complete units only; partials never count. One unit per patient.
export const UNIT_COMPONENTS = ["cassette", "high-speed", "contra-angle", "hook"] as const;

// ---- Devices (equipment register) ----
// Every clinic's physical devices, with serial number and working status.
// Visible to all roles; editable by all — device status causes real management
// headaches, so wide visibility/editing is the point.

/** The standard endodontic device types, plus "Other" for anything else. */
export const DEVICE_TYPES = [
  "PC & X-ray Sensor",
  "Rotary Device",
  "Obturation Heating Pen",
  "Warm Gutta-Percha Delivery Device",
  "Apex Locator",
  "Irrigation Activator",
  "Other",
] as const;

export type DeviceType = (typeof DEVICE_TYPES)[number];

/** 3-way device status. */
export type DeviceStatus = "working" | "needs_parts" | "not_working";

export const DEVICE_STATUS_LABEL: Record<DeviceStatus, string> = {
  working: "Working",
  needs_parts: "Working — needs parts",
  not_working: "Not working",
};

export interface Device {
  id: string;
  departmentId: string;   // "endo" today; ready for more
  clinicId: string;       // which clinic this device sits in
  type: DeviceType;       // one of DEVICE_TYPES
  customName: string;     // the typed name when type === "Other" (else "")
  serialNumber: string;
  status: DeviceStatus;
  notes: string;          // free text, optional
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** Display name: the custom name for "Other" devices, otherwise the type. */
export function deviceName(d: Device): string {
  return d.type === "Other" && d.customName.trim() ? d.customName.trim() : d.type;
}

// ---- Where each role lands after login ----
export const ROLE_HOME: Record<Role, string> = {
  clinic: "/clinic/dashboard",
  store: "/store/dashboard",
  sterilization: "/sterilization/dashboard",
  admin: "/admin/dashboard",
  maintenance: "/maintenance/devices",
};