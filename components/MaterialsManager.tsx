// components/MaterialsManager.tsx
// Shared materials-status UI. Used by the clinic, admin, and store pages.
// - clinicId set  → that one clinic's board (clinic staff).
// - clinicId null → every clinic, with a clinic picker (admin / store).
// canEdit — clinic staff (own board) and admin: true; store: false (view only).
// Exports live in EquipmentReport.tsx (the combined devices + materials report).
"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Clinic,
  ClinicMaterials,
  MaterialStatus,
  MATERIAL_SECTIONS,
  MATERIAL_STATUS_LABEL,
  ALL_MATERIAL_ITEMS,
  materialStatus,
} from "@/lib/types";
import {
  fetchMaterialsForClinic,
  fetchMaterialsForDepartment,
  setMaterialStatus,
} from "@/lib/data/materialsApi";
import { fetchClinics } from "@/lib/data/adminApi";
import { useAuth } from "@/lib/hooks/useAuth";

const DEPT = "endo";

/** Chip order mirrors the requested wording: N/A, Shortage, Available. */
const STATUS_ORDER: MaterialStatus[] = ["na", "shortage", "available"];

const statusPill: Record<MaterialStatus, string> = {
  na: "bg-white/10 text-slate-300",
  shortage: "bg-red-500/15 text-red-300",
  available: "bg-emerald/15 text-emerald",
};

export default function MaterialsManager({
  clinicId,
  canEdit,
}: {
  clinicId: string | null; // null = all clinics
  canEdit: boolean;
}) {
  const { appUser } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [docs, setDocs] = useState<ClinicMaterials[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState(clinicId ?? "");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const refresh = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setLoading(true);
      const [list, cl] = await Promise.all([
        clinicId
          ? fetchMaterialsForClinic(clinicId).then((m) => (m ? [m] : []))
          : fetchMaterialsForDepartment(DEPT),
        fetchClinics(DEPT),
      ]);
      setDocs(list);
      setClinics(cl);
      if (!clinicId) {
        // Keep the current selection; default to the first clinic on first load.
        setSelectedClinicId((prev) => prev || cl[0]?.id || "");
      }
      setLoading(false);
    },
    [clinicId]
  );

  useEffect(() => {
    refresh(true);
  }, [refresh]);

  if (loading) {
    return <p className="text-sm text-slate-400">Loading materials…</p>;
  }

  const sortedClinics = [...clinics].sort((a, b) => a.number - b.number);
  const clinicLabelFor = (id: string) => {
    const c = clinics.find((x) => x.id === id);
    return c ? `ENDO${c.number}` : id;
  };
  const docFor = (id: string) => docs.find((d) => d.clinicId === id);

  const boardClinicId = clinicId ?? selectedClinicId;
  const boardDoc = boardClinicId ? docFor(boardClinicId) : undefined;

  const counts = { na: 0, shortage: 0, available: 0 };
  for (const item of ALL_MATERIAL_ITEMS) {
    counts[materialStatus(boardDoc, item.key)] += 1;
  }

  const shortagesOf = (id: string) => {
    const d = docFor(id);
    return ALL_MATERIAL_ITEMS.filter((i) => materialStatus(d, i.key) === "shortage").length;
  };

  async function handleSet(itemKey: string, status: MaterialStatus) {
    if (!canEdit || busyKey || !boardClinicId) return;
    if (materialStatus(boardDoc, itemKey) === status) return;
    setErr("");
    setBusyKey(itemKey);
    try {
      await setMaterialStatus({
        departmentId: DEPT,
        clinicId: boardClinicId,
        itemKey,
        status,
        updatedBy: appUser?.displayName ?? "",
      });
      await refresh(); // silent — no spinner, no flicker
    } catch {
      setErr("Couldn't save that change — check your connection and try again.");
    } finally {
      setBusyKey(null);
    }
  }

  const updatedLine = boardDoc?.updatedAt
    ? `Last updated ${boardDoc.updatedAt.toDate().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}${boardDoc.updatedBy ? ` by ${boardDoc.updatedBy}` : ""}`
    : "No statuses saved yet — everything defaults to N/A.";

  return (
    <div className="space-y-8">
      <div>
        <h1
          className="text-4xl font-semibold text-white"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Materials{clinicId ? "" : " · All Clinics"}
        </h1>
        <p className="mt-1 text-slate-400">
          {counts.available} available · {counts.shortage} shortage · {counts.na} N/A
        </p>
      </div>

      {err && (
        <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{err}</p>
      )}

      {!canEdit && (
        <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-400">
          View only — statuses are set by the clinic or admin.
        </p>
      )}

      {/* Clinic picker — all-clinics view only */}
      {!clinicId && (
        <div className="flex flex-wrap gap-2">
          {sortedClinics.map((c) => {
            const shortages = shortagesOf(c.id);
            return (
              <button
                key={c.id}
                onClick={() => setSelectedClinicId(c.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  selectedClinicId === c.id
                    ? "bg-emerald/15 text-emerald"
                    : "bg-white/5 text-slate-400 hover:text-white"
                }`}
              >
                ENDO{c.number}
                {shortages > 0 && (
                  <span className="ml-1.5 text-red-300">· {shortages}</span>
                )}
              </button>
            );
          })}
          {sortedClinics.length === 0 && (
            <p className="text-sm text-slate-400">No clinics yet.</p>
          )}
        </div>
      )}

      {boardClinicId && (
        <>
          <p className="text-xs text-slate-500">
            {clinicId ? "" : `${clinicLabelFor(boardClinicId)} — `}
            {updatedLine}
          </p>

          {MATERIAL_SECTIONS.map((section) => (
            <section key={section.key} className="glass rounded-3xl p-6">
              <h2
                className="mb-2 text-xl font-semibold text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {section.title}
              </h2>
              <div className="divide-y divide-white/5">
                {section.items.map((item) => {
                  const st = materialStatus(boardDoc, item.key);
                  return (
                    <div
                      key={item.key}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                    >
                      <span className="text-sm text-slate-200">{item.label}</span>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        {STATUS_ORDER.map((s) => (
                          <button
                            key={s}
                            onClick={() => handleSet(item.key, s)}
                            disabled={!canEdit || busyKey === item.key}
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50 ${
                              st === s
                                ? statusPill[s]
                                : `bg-white/5 text-slate-500${
                                    canEdit ? " hover:text-white" : ""
                                  }`
                            }`}
                          >
                            {MATERIAL_STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}