// components/DeviceManager.tsx
// Shared device-register UI. Used by every role's devices page.
// - clinicId set  → shows/《adds to》 that one clinic (clinic staff).
// - clinicId null → shows all clinics, grouped (admin / maintenance / store / sterilization).
"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Device,
  DeviceStatus,
  DeviceType,
  DEVICE_TYPES,
  DEVICE_STATUS_LABEL,
  deviceName,
  Clinic,
} from "@/lib/types";
import {
  fetchDevices,
  fetchDevicesForClinic,
  addDevice,
  updateDevice,
  setDeviceStatus,
  deleteDevice,
} from "@/lib/data/devicesApi";
import { fetchClinics } from "@/lib/data/adminApi";

const DEPT = "endo";

const inputCls =
  "rounded-lg border border-white/15 bg-(--color-navy) px-3 py-2 text-sm text-white outline-none focus:border-emerald/60";

const STATUS_ORDER: DeviceStatus[] = ["working", "needs_parts", "not_working"];

const statusPill: Record<DeviceStatus, string> = {
  working: "bg-emerald/15 text-emerald",
  needs_parts: "bg-amber-500/15 text-amber-300",
  not_working: "bg-red-500/15 text-red-300",
};

export default function DeviceManager({
  clinicId,
  canAdd,
}: {
  clinicId: string | null; // null = all clinics
  canAdd: boolean;
}) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [statusFilter, setStatusFilter] = useState<DeviceStatus | "all">("all");

  const refresh = useCallback(async () => {
    setLoading(true);
    const [list, cl] = await Promise.all([
      clinicId ? fetchDevicesForClinic(DEPT, clinicId) : fetchDevices(DEPT),
      fetchClinics(DEPT),
    ]);
    setDevices(list);
    setClinics(cl);
    setLoading(false);
  }, [clinicId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) {
    return <p className="text-sm text-slate-400">Loading devices…</p>;
  }

  const clinicLabelFor = (id: string) => {
    const c = clinics.find((x) => x.id === id);
    return c ? `ENDO${c.number}` : id;
  };

  const shown =
    statusFilter === "all" ? devices : devices.filter((d) => d.status === statusFilter);

  const counts = {
    working: devices.filter((d) => d.status === "working").length,
    needs_parts: devices.filter((d) => d.status === "needs_parts").length,
    not_working: devices.filter((d) => d.status === "not_working").length,
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            className="text-4xl font-semibold text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Devices{clinicId ? "" : " · All Clinics"}
          </h1>
          <p className="mt-1 text-slate-400">
            {devices.length === 0
              ? "No devices registered yet."
              : `${devices.length} device${devices.length === 1 ? "" : "s"} · ` +
                `${counts.working} working · ${counts.needs_parts} need parts · ${counts.not_working} down`}
          </p>
        </div>
        {canAdd && devices.length > 0 && (
          <button
            onClick={() => setAdding((a) => !a)}
            className="rounded-lg bg-emerald px-5 py-2 text-sm font-semibold text-(--color-navy) transition hover:bg-(--color-emerald-soft)"
          >
            {adding ? "Cancel" : "+ Add device"}
          </button>
        )}
      </div>

      {/* Status filter */}
      {devices.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(["all", ...STATUS_ORDER] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                statusFilter === s
                  ? "bg-emerald/15 text-emerald"
                  : "bg-white/5 text-slate-400 hover:text-white"
              }`}
            >
              {s === "all" ? "All" : DEVICE_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}

      {adding && (
        <AddDeviceCard
          clinicId={clinicId}
          clinics={clinics}
          onDone={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}

      {devices.length === 0 ? (
        canAdd ? (
          <AddDeviceCard clinicId={clinicId} clinics={clinics} onDone={refresh} inline />
        ) : (
          <section className="glass rounded-3xl p-8">
            <p className="text-slate-300">No devices have been registered yet.</p>
          </section>
        )
      ) : (
        <div className="space-y-3">
          {shown.map((d) => (
            <DeviceRow
              key={d.id}
              device={d}
              clinicLabel={clinicId ? null : clinicLabelFor(d.clinicId)}
              onChanged={refresh}
            />
          ))}
          {shown.length === 0 && (
            <p className="text-sm text-slate-400">No devices with this status.</p>
          )}
        </div>
      )}
    </div>
  );
}

function AddDeviceCard({
  clinicId,
  clinics,
  onDone,
  inline,
}: {
  clinicId: string | null;
  clinics: Clinic[];
  onDone: () => void;
  inline?: boolean;
}) {
  const [targetClinic, setTargetClinic] = useState(clinicId ?? clinics[0]?.id ?? "");
  const [type, setType] = useState<DeviceType>(DEVICE_TYPES[0]);
  const [customName, setCustomName] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [status, setStatus] = useState<DeviceStatus>("working");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!targetClinic) {
      setErr("Pick a clinic.");
      return;
    }
    if (type === "Other" && !customName.trim()) {
      setErr("Give the device a name.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await addDevice({
        departmentId: DEPT,
        clinicId: targetClinic,
        type,
        customName: type === "Other" ? customName : "",
        serialNumber,
        status,
        notes,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't add the device.");
      setBusy(false);
    }
  }

  return (
    <section className="glass rounded-3xl p-6">
      <h2
        className="mb-4 text-xl font-semibold text-white"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {inline ? "Register the first device" : "Add a device"}
      </h2>
      {err && (
        <p className="mb-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{err}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Clinic — only when this view spans all clinics */}
        {!clinicId && (
          <select
            className={inputCls}
            value={targetClinic}
            onChange={(e) => setTargetClinic(e.target.value)}
          >
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>
                ENDO{c.number}
              </option>
            ))}
          </select>
        )}

        <select
          className={inputCls}
          value={type}
          onChange={(e) => setType(e.target.value as DeviceType)}
        >
          {DEVICE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {type === "Other" && (
          <input
            className={inputCls}
            placeholder="Device name (e.g. Amalgamator for GIC capsule)"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
          />
        )}

        <input
          className={inputCls}
          placeholder="Serial number"
          value={serialNumber}
          onChange={(e) => setSerialNumber(e.target.value)}
        />

        <select
          className={inputCls}
          value={status}
          onChange={(e) => setStatus(e.target.value as DeviceStatus)}
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {DEVICE_STATUS_LABEL[s]}
            </option>
          ))}
        </select>

        <input
          className={`${inputCls} sm:col-span-2`}
          placeholder="Notes (optional — e.g. left handpiece, sent for repair 5/7)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <button
        onClick={save}
        disabled={busy}
        className="mt-5 rounded-lg bg-emerald px-8 py-2.5 text-sm font-semibold text-(--color-navy) transition hover:bg-(--color-emerald-soft) disabled:opacity-60"
      >
        {busy ? "Adding…" : "Add device"}
      </button>
    </section>
  );
}

function DeviceRow({
  device,
  clinicLabel,
  onChanged,
}: {
  device: Device;
  clinicLabel: string | null; // shown only in all-clinics view
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  // edit-form state
  const [type, setType] = useState<DeviceType>(device.type);
  const [customName, setCustomName] = useState(device.customName);
  const [serialNumber, setSerialNumber] = useState(device.serialNumber);
  const [notes, setNotes] = useState(device.notes);

  async function changeStatus(s: DeviceStatus) {
    if (s === device.status) return;
    setBusy(true);
    await setDeviceStatus(device.id, s);
    setBusy(false);
    onChanged();
  }

  async function saveEdit() {
    if (type === "Other" && !customName.trim()) return;
    setBusy(true);
    await updateDevice(device.id, {
      type,
      customName: type === "Other" ? customName : "",
      serialNumber,
      notes,
    });
    setBusy(false);
    setEditing(false);
    onChanged();
  }

  async function remove() {
    if (!confirm("Remove this device from the register?")) return;
    setBusy(true);
    await deleteDevice(device.id);
    setBusy(false);
    onChanged();
  }

  return (
    <section className="glass rounded-2xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-white">{deviceName(device)}</span>
            {clinicLabel && (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">
                {clinicLabel}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {device.serialNumber ? `Serial #${device.serialNumber}` : "No serial number"}
          </p>
          {device.notes && <p className="mt-1 text-sm text-slate-400">{device.notes}</p>}
        </div>

        {/* Quick status buttons */}
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => changeStatus(s)}
              disabled={busy}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50 ${
                device.status === s
                  ? statusPill[s]
                  : "bg-white/5 text-slate-500 hover:text-white"
              }`}
            >
              {DEVICE_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex gap-3 border-t border-white/10 pt-2">
        <button
          onClick={() => setEditing((e) => !e)}
          className="text-xs font-semibold text-emerald transition hover:text-(--color-emerald-soft)"
        >
          {editing ? "Close" : "Edit details"}
        </button>
        <button
          onClick={remove}
          disabled={busy}
          className="text-xs text-slate-500 transition hover:text-red-300 disabled:opacity-50"
        >
          Remove
        </button>
      </div>

      {editing && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <select
            className={inputCls}
            value={type}
            onChange={(e) => setType(e.target.value as DeviceType)}
          >
            {DEVICE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {type === "Other" && (
            <input
              className={inputCls}
              placeholder="Device name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
          )}
          <input
            className={inputCls}
            placeholder="Serial number"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
          />
          <input
            className={`${inputCls} sm:col-span-2`}
            placeholder="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button
            onClick={saveEdit}
            disabled={busy}
            className="rounded-lg bg-emerald px-6 py-2 text-xs font-semibold text-(--color-navy) transition hover:bg-(--color-emerald-soft) disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </section>
  );
}