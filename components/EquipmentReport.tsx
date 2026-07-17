// components/EquipmentReport.tsx
// The "occasional report" — full devices & materials status, exported as
// PDF or Excel (CSV). Used on the clinic, admin, and store pages.
// - clinicId set  → report covers that one clinic.
// - clinicId null → report covers every clinic in the department.
"use client";

import { useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Clinic,
  ClinicMaterials,
  Device,
  DEVICE_STATUS_LABEL,
  deviceName,
  MATERIAL_SECTIONS,
  MATERIAL_STATUS_LABEL,
  materialStatus,
} from "@/lib/types";
import { fetchDevices, fetchDevicesForClinic } from "@/lib/data/devicesApi";
import {
  fetchMaterialsForClinic,
  fetchMaterialsForDepartment,
} from "@/lib/data/materialsApi";
import { fetchClinics } from "@/lib/data/adminApi";

const DEPT = "endo";

// Print palette — the app's navy / emerald / red, tuned for paper.
const NAVY: [number, number, number] = [15, 23, 42];
const EMERALD: [number, number, number] = [13, 148, 106];
const RED: [number, number, number] = [200, 40, 40];
const AMBER: [number, number, number] = [200, 120, 10];
const GRAY: [number, number, number] = [120, 130, 140];

interface ReportData {
  clinics: Clinic[]; // sorted, only the ones in scope
  devices: Device[];
  materials: ClinicMaterials[];
}

export default function EquipmentReport({ clinicId }: { clinicId: string | null }) {
  const [busy, setBusy] = useState<"pdf" | "excel" | null>(null);
  const [err, setErr] = useState("");

  async function loadData(): Promise<ReportData> {
    const [allClinics, devices, materials] = await Promise.all([
      fetchClinics(DEPT),
      clinicId ? fetchDevicesForClinic(DEPT, clinicId) : fetchDevices(DEPT),
      clinicId
        ? fetchMaterialsForClinic(clinicId).then((m) => (m ? [m] : []))
        : fetchMaterialsForDepartment(DEPT),
    ]);
    const clinics = allClinics
      .filter((c) => (clinicId ? c.id === clinicId : true))
      .sort((a, b) => a.number - b.number);
    return { clinics, devices, materials };
  }

  const labelFor = (clinics: Clinic[], id: string) => {
    const c = clinics.find((x) => x.id === id);
    return c ? `ENDO${c.number}` : id;
  };

  const today = () =>
    new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  const stamp = () => new Date().toISOString().slice(0, 10);

  /** Device rows: Clinic, Device, Serial, Status, Notes. */
  function deviceRows(data: ReportData): string[][] {
    const num = (id: string) => data.clinics.find((c) => c.id === id)?.number ?? 0;
    const sorted = [...data.devices].sort(
      (a, b) => num(a.clinicId) - num(b.clinicId) || deviceName(a).localeCompare(deviceName(b))
    );
    const rows = sorted.map((d) => [
      labelFor(data.clinics, d.clinicId),
      deviceName(d),
      d.serialNumber || "",
      DEVICE_STATUS_LABEL[d.status],
      d.notes || "",
    ]);
    if (rows.length === 0) rows.push(["", "No devices registered", "", "", ""]);
    return rows;
  }

  /** Material rows: Clinic, Section, Item, Status (+ Last updated, Updated by for Excel). */
  function materialRows(data: ReportData, withMeta: boolean): string[][] {
    const docFor = (id: string) => data.materials.find((m) => m.clinicId === id);
    const rows: string[][] = [];
    for (const c of data.clinics) {
      const m = docFor(c.id);
      const updated = m?.updatedAt
        ? m.updatedAt.toDate().toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "";
      for (const section of MATERIAL_SECTIONS) {
        for (const item of section.items) {
          const row = [
            `ENDO${c.number}`,
            section.title,
            item.label,
            MATERIAL_STATUS_LABEL[materialStatus(m, item.key)],
          ];
          if (withMeta) row.push(updated, m?.updatedBy ?? "");
          rows.push(row);
        }
      }
    }
    return rows;
  }

  async function exportPdf() {
    setErr("");
    setBusy("pdf");
    try {
      const data = await loadData();
      const doc = new jsPDF();
      const scope = clinicId ? labelFor(data.clinics, clinicId) : "All Clinics";

      // Header band
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, 210, 26, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("EndoEquip — Devices & Materials Report", 14, 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`${scope} · Endodontics · Generated ${today()}`, 14, 20);

      // Devices
      doc.setTextColor(...NAVY);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("Devices", 14, 36);
      autoTable(doc, {
        startY: 40,
        head: [["Clinic", "Device", "Serial", "Status", "Notes"]],
        body: deviceRows(data),
        headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9 },
        styles: { fontSize: 8.5, cellPadding: 2 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        didParseCell: (d) => {
          if (d.section === "body" && d.column.index === 3) {
            const t = String(d.cell.raw);
            if (t === DEVICE_STATUS_LABEL.not_working) {
              d.cell.styles.textColor = RED;
              d.cell.styles.fontStyle = "bold";
            } else if (t === DEVICE_STATUS_LABEL.needs_parts) {
              d.cell.styles.textColor = AMBER;
            } else if (t === DEVICE_STATUS_LABEL.working) {
              d.cell.styles.textColor = EMERALD;
            }
          }
        },
      });

      // Materials
      const withTable = doc as jsPDF & { lastAutoTable?: { finalY: number } };
      let y = (withTable.lastAutoTable?.finalY ?? 40) + 12;
      if (y > 265) {
        doc.addPage();
        y = 20;
      }
      doc.setTextColor(...NAVY);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("Materials", 14, y);
      autoTable(doc, {
        startY: y + 4,
        head: [["Clinic", "Section", "Item", "Status"]],
        body: materialRows(data, false),
        headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9 },
        styles: { fontSize: 8.5, cellPadding: 2 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        didParseCell: (d) => {
          if (d.section === "body" && d.column.index === 3) {
            const t = String(d.cell.raw);
            if (t === MATERIAL_STATUS_LABEL.shortage) {
              d.cell.styles.textColor = RED;
              d.cell.styles.fontStyle = "bold";
            } else if (t === MATERIAL_STATUS_LABEL.available) {
              d.cell.styles.textColor = EMERALD;
            } else {
              d.cell.styles.textColor = GRAY;
            }
          }
        },
      });

      // Page numbers
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...GRAY);
        doc.text(`Page ${i} of ${pages}`, 196, 290, { align: "right" });
      }

      doc.save(`endoequip-report-${stamp()}.pdf`);
    } catch {
      setErr("Couldn't build the PDF — check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function exportExcel() {
    setErr("");
    setBusy("excel");
    try {
      const data = await loadData();
      const scope = clinicId ? labelFor(data.clinics, clinicId) : "All Clinics";
      const rows: string[][] = [
        ["EndoEquip — Devices & Materials Report"],
        [`Scope: ${scope}`, `Generated: ${today()}`],
        [],
        ["DEVICES"],
        ["Clinic", "Device", "Serial", "Status", "Notes"],
        ...deviceRows(data),
        [],
        ["MATERIALS"],
        ["Clinic", "Section", "Item", "Status", "Last updated", "Updated by"],
        ...materialRows(data, true),
      ];
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const csv = "\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `endoequip-report-${stamp()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErr("Couldn't build the Excel file — check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="glass rounded-3xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2
            className="text-xl font-semibold text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Occasional Report
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Full devices &amp; materials status — {clinicId ? "this clinic" : "all clinics"},
            fetched fresh at export time.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportPdf}
            disabled={busy !== null}
            className="rounded-lg bg-emerald px-5 py-2 text-sm font-semibold text-(--color-navy) transition hover:bg-(--color-emerald-soft) disabled:opacity-60"
          >
            {busy === "pdf" ? "Building…" : "Export PDF"}
          </button>
          <button
            onClick={exportExcel}
            disabled={busy !== null}
            className="rounded-lg border border-white/15 px-5 py-2 text-sm text-slate-300 transition hover:border-white/30 hover:text-white disabled:opacity-60"
          >
            {busy === "excel" ? "Building…" : "Export Excel"}
          </button>
        </div>
      </div>
      {err && (
        <p className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{err}</p>
      )}
    </section>
  );
}