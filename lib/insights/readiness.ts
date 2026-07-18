// lib/insights/readiness.ts
// Pure calculation engine for the clinic-readiness insight.
// No Firestore, no React, and — by design — NO hardcoded operating numbers.
// Every figure comes from the admin-entered ReadinessConfig passed in as an
// argument. The tool ships knowing nothing about any department and learns
// everything from the config doc, so another facility just fills in its own
// numbers.

import {
  Clinic,
  ClinicMaterials,
  Device,
  DeviceStatus,
  ALL_MATERIAL_ITEMS,
  MaterialItem,
  materialStatus,
} from "@/lib/types";

/**
 * Admin-entered configuration. One doc per department in the
 * "insightsConfig" collection (doc id = departmentId). Nothing here has a
 * code-level default — the UI must collect every required field before the
 * engine will run. Percentages are 0–100 exactly as the admin types them.
 */
export interface ReadinessConfig {
  departmentId: string;
  casesPerMonth: number;   // the anchor — admin types this directly
  visitsPerCase: number;
  initialPct: number;      // initial + retreatment must sum to 100
  retreatmentPct: number;
  obturationPct: number;   // share of cases reaching obturation this month
  medicationPct: number;   // share of cases getting an intra-canal dressing
  // Reference-only fields — displayed for context, never used in the math:
  patientsPerDay: number | null;
  workingDaysPerMonth: number | null;
  clinicCount: number | null;
  updatedAt?: unknown;     // Firestore Timestamp when persisted
  updatedBy?: string;
}

/** Validate a config before running the engine. Returns [] when valid. */
export function validateConfig(c: Partial<ReadinessConfig>): string[] {
  const errors: string[] = [];
  const isNum = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);

  if (!isNum(c.casesPerMonth) || c.casesPerMonth <= 0)
    errors.push("Total cases per month is required and must be greater than 0.");
  if (!isNum(c.visitsPerCase) || c.visitsPerCase <= 0)
    errors.push("Visits per case is required and must be greater than 0.");

  const pctFields: Array<[keyof ReadinessConfig, string]> = [
    ["initialPct", "Initial cases %"],
    ["retreatmentPct", "Retreatment cases %"],
    ["obturationPct", "Obturation %"],
    ["medicationPct", "Medication %"],
  ];
  for (const [key, label] of pctFields) {
    const v = c[key];
    if (!isNum(v) || v < 0 || v > 100)
      errors.push(`${label} is required and must be between 0 and 100.`);
  }

  if (
    isNum(c.initialPct) &&
    isNum(c.retreatmentPct) &&
    Math.abs(c.initialPct + c.retreatmentPct - 100) > 0.01
  ) {
    errors.push("Initial % and Retreatment % must add up to 100.");
  }

  const refFields: Array<[keyof ReadinessConfig, string]> = [
    ["patientsPerDay", "Patients per day"],
    ["workingDaysPerMonth", "Working days per month"],
    ["clinicCount", "Number of clinics"],
  ];
  for (const [key, label] of refFields) {
    const v = c[key];
    if (v !== null && v !== undefined && (!isNum(v) || v < 0))
      errors.push(`${label} must be a number of 0 or more (or left empty).`);
  }

  return errors;
}

// ---- Drivers ----

/** What drives consumption of a given material item. */
export type Driver = "all_cases" | "retreatment" | "obturation" | "medication";

export const DRIVER_LABEL: Record<Driver, string> = {
  all_cases: "Every case",
  retreatment: "Retreatment cases",
  obturation: "Obturation visits",
  medication: "Medication visits",
};

/**
 * Maps each material item key (from MATERIAL_SECTIONS in lib/types) to its
 * consumption driver. H-files map to "retreatment" for demand estimation and
 * are ranked like any other item. The always-stock items (glide path files,
 * rotary kit) flag on shortage regardless of computed volume — see
 * ALWAYS_STOCK below. The apex locator is a device, handled separately as a
 * step-blocking device.
 */
export const ITEM_DRIVER: Record<string, Driver> = {
  hand_c_cplus_pilot: "all_cases",
  glide_k06: "all_cases",
  glide_k08: "all_cases",
  glide_k10: "all_cases",
  k15: "all_cases",
  k20: "all_cases",
  k25: "all_cases",
  k30: "all_cases",
  k35: "all_cases",
  k40: "all_cases",
  h15: "retreatment",
  h20: "retreatment",
  h25: "retreatment",
  h30: "retreatment",
  h35: "retreatment",
  h40: "retreatment",
  rotary_kit: "all_cases",
  gutta_percha: "obturation",
  paper_points: "obturation",
  caoh_water: "medication",
  caoh_powder: "medication",
  sealer_cs: "obturation",
  sealer_resin: "obturation",
  sealer_other: "obturation",
  temp_filling: "all_cases",
};

/**
 * Items every case needs at a non-skippable step. A shortage of any of these
 * flags as critical regardless of computed volume.
 */
export const ALWAYS_STOCK = new Set<string>([
  "glide_k06",
  "glide_k08",
  "glide_k10",
  "rotary_kit",
]);

/**
 * Device types whose failure blocks an entire treatment step — a hard stop
 * regardless of volume. Maps device type → the step it blocks.
 */
export const BLOCKING_DEVICES: Record<string, string> = {
  "Apex Locator": "working length determination",
  "Rotary Device": "canal shaping",
};

// ---- Demand model ----

/** Estimated monthly volume behind each driver, derived only from config. */
export function computeDriverDemand(c: ReadinessConfig): Record<Driver, number> {
  return {
    all_cases: Math.round(c.casesPerMonth),
    retreatment: Math.round((c.casesPerMonth * c.retreatmentPct) / 100),
    obturation: Math.round((c.casesPerMonth * c.obturationPct) / 100),
    medication: Math.round((c.casesPerMonth * c.medicationPct) / 100),
  };
}

// ---- Verdict model ----

export type Verdict = "ready" | "at_risk" | "not_ready";

export const VERDICT_LABEL: Record<Verdict, string> = {
  ready: "Ready",
  at_risk: "At risk",
  not_ready: "Not ready",
};

export interface HardStop {
  deviceType: string;
  blockedStep: string;
  deviceStatus: DeviceStatus;
}

export interface RankedShortage {
  item: MaterialItem;
  driver: Driver;
  monthlyDemand: number;
  critical: boolean; // true for ALWAYS_STOCK items
}

export interface ClinicAssessment {
  clinic: Clinic;
  verdict: Verdict;
  hardStops: HardStop[];              // blocking device fully down
  deviceWarnings: string[];           // blocking device running but needs parts
  missingBlockingDevices: string[];   // blocking type with no register entry
  criticalShortages: RankedShortage[];// always-stock items in shortage
  shortages: RankedShortage[];        // other shortages, ranked by demand
  unreportedCount: number;            // material items still "na"
  totalShortageDemand: number;        // sum of demand behind all shortages
}

export interface ReadinessResult {
  demandByDriver: Record<Driver, number>;
  monthlyVisits: number;
  clinics: ClinicAssessment[]; // ranked worst-first
}

function assessClinic(
  clinic: Clinic,
  mats: ClinicMaterials | undefined,
  clinicDevices: Device[],
  demand: Record<Driver, number>
): ClinicAssessment {
  // Devices: for each blocking type, find the best-status unit in the clinic.
  const hardStops: HardStop[] = [];
  const deviceWarnings: string[] = [];
  const missingBlockingDevices: string[] = [];

  for (const [type, step] of Object.entries(BLOCKING_DEVICES)) {
    const ofType = clinicDevices.filter((d) => d.type === type);
    if (ofType.length === 0) {
      missingBlockingDevices.push(type);
      continue;
    }
    if (ofType.some((d) => d.status === "working")) continue; // step is covered
    if (ofType.some((d) => d.status === "needs_parts")) {
      deviceWarnings.push(`${type} needs parts — ${step} at risk`);
    } else {
      hardStops.push({
        deviceType: type,
        blockedStep: step,
        deviceStatus: "not_working",
      });
    }
  }

  // Materials: walk the full catalog once.
  const criticalShortages: RankedShortage[] = [];
  const shortages: RankedShortage[] = [];
  let unreportedCount = 0;

  for (const item of ALL_MATERIAL_ITEMS) {
    const status = materialStatus(mats, item.key);
    if (status === "na") {
      unreportedCount += 1;
      continue;
    }
    if (status !== "shortage") continue;
    const driver = ITEM_DRIVER[item.key] ?? "all_cases";
    const entry: RankedShortage = {
      item,
      driver,
      monthlyDemand: demand[driver],
      critical: ALWAYS_STOCK.has(item.key),
    };
    if (entry.critical) criticalShortages.push(entry);
    else shortages.push(entry);
  }

  shortages.sort((a, b) => b.monthlyDemand - a.monthlyDemand);

  const totalShortageDemand =
    criticalShortages.reduce((s, e) => s + e.monthlyDemand, 0) +
    shortages.reduce((s, e) => s + e.monthlyDemand, 0);

  const verdict: Verdict =
    hardStops.length > 0 || criticalShortages.length > 0
      ? "not_ready"
      : shortages.length > 0 ||
        deviceWarnings.length > 0 ||
        missingBlockingDevices.length > 0
      ? "at_risk"
      : "ready";

  return {
    clinic,
    verdict,
    hardStops,
    deviceWarnings,
    missingBlockingDevices,
    criticalShortages,
    shortages,
    unreportedCount,
    totalShortageDemand,
  };
}

const VERDICT_RANK: Record<Verdict, number> = { not_ready: 0, at_risk: 1, ready: 2 };

/**
 * The engine. Everything numeric comes from `config`; everything factual
 * comes from the live materials/devices data passed in.
 */
export function computeReadiness(
  config: ReadinessConfig,
  clinics: Clinic[],
  materials: ClinicMaterials[],
  devices: Device[]
): ReadinessResult {
  const demand = computeDriverDemand(config);
  const matsByClinic = new Map(materials.map((m) => [m.clinicId, m]));
  const devsByClinic = new Map<string, Device[]>();
  for (const d of devices) {
    const list = devsByClinic.get(d.clinicId) ?? [];
    list.push(d);
    devsByClinic.set(d.clinicId, list);
  }

  const assessments = clinics.map((c) =>
    assessClinic(c, matsByClinic.get(c.id), devsByClinic.get(c.id) ?? [], demand)
  );

  // Rank worst-first: verdict tier, then count of blocking problems, then
  // the demand volume sitting behind the shortages. No weight constants —
  // pure tiered comparison.
  assessments.sort((a, b) => {
    const tier = VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict];
    if (tier !== 0) return tier;
    const blockers =
      b.hardStops.length + b.criticalShortages.length -
      (a.hardStops.length + a.criticalShortages.length);
    if (blockers !== 0) return blockers;
    return b.totalShortageDemand - a.totalShortageDemand;
  });

  return {
    demandByDriver: demand,
    monthlyVisits: Math.round(config.casesPerMonth * config.visitsPerCase),
    clinics: assessments,
  };
}