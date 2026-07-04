// app/admin/users/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { FirebaseError } from "firebase/app";
import RoleGuard from "@/components/RoleGuard";
import AppShell from "@/components/AppShell";
import { AppUser, Clinic, Department, Role, clinicLabel } from "@/lib/types";
import {
  fetchUsers,
  fetchClinics,
  fetchDepartments,
  createUserWithRole,
  createDepartment,
  createClinic,
} from "@/lib/data/adminApi";

const ROLES: Role[] = ["clinic", "store", "sterilization", "admin"];
const ROLE_LABEL: Record<Role, string> = {
  clinic: "Clinic",
  store: "Store",
  sterilization: "Sterilization",
  admin: "Admin",
};

export default function AdminUsersPage() {
  return (
    <RoleGuard allow="admin">
      <AppShell>
        <AdminPanel />
      </AppShell>
    </RoleGuard>
  );
}

function AdminPanel() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [d, c, u] = await Promise.all([fetchDepartments(), fetchClinics(), fetchUsers()]);
    setDepartments(d);
    setClinics(c);
    setUsers(u);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
          Admin
        </h1>
        <p className="mt-1 text-slate-400">
          Set up departments and clinics first, then create staff accounts.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <DepartmentsCard departments={departments} onChanged={refresh} />
        <ClinicsCard departments={departments} clinics={clinics} onChanged={refresh} />
      </div>

      <CreateUserCard departments={departments} clinics={clinics} onCreated={refresh} />
      <UsersList users={users} departments={departments} clinics={clinics} loading={loading} />
    </div>
  );
}

/* ---------------- Departments ---------------- */

function DepartmentsCard({
  departments,
  onChanged,
}: {
  departments: Department[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function add() {
    setErr("");
    if (!name.trim() || !code.trim()) {
      setErr("Enter a name and a short code.");
      return;
    }
    setBusy(true);
    try {
      await createDepartment(name, code);
      setName("");
      setCode("");
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't create department.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass rounded-3xl p-7">
      <h2 className="mb-1 text-xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
        Departments
      </h2>
      <p className="mb-4 text-xs text-slate-400">
        The code becomes the clinic prefix — e.g. code <span className="text-(--color-emerald)">ENDO</span> makes clinic <span className="text-(--color-emerald)">ENDO258</span>.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {departments.length === 0 && <p className="text-sm text-slate-500">No departments yet.</p>}
        {departments.map((d) => (
          <span key={d.id} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-slate-200">
            <span className="font-semibold text-(--color-emerald)">{d.code}</span> · {d.name}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Department name (Endodontics)"
          className="flex-1 rounded-lg border border-slate-600 bg-(--color-navy) px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-(--color-emerald) focus:ring-1 focus:ring-(--color-emerald)"
        />
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="CODE"
          maxLength={8}
          className="w-full rounded-lg border border-slate-600 bg-(--color-navy) px-3 py-2 text-sm uppercase text-white placeholder-slate-500 outline-none focus:border-(--color-emerald) focus:ring-1 focus:ring-(--color-emerald) sm:w-28"
        />
        <button
          onClick={add}
          disabled={busy}
          className="rounded-lg border border-(--color-emerald)/40 px-4 py-2 text-sm font-semibold text-(--color-emerald) transition hover:bg-(--color-emerald)/10 disabled:opacity-60"
        >
          Add
        </button>
      </div>
      {err && <p className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{err}</p>}
    </section>
  );
}

/* ---------------- Clinics ---------------- */

function ClinicsCard({
  departments,
  clinics,
  onChanged,
}: {
  departments: Department[];
  clinics: Clinic[];
  onChanged: () => void;
}) {
  const [departmentId, setDepartmentId] = useState("");
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const codeFor = (id: string) => departments.find((d) => d.id === id)?.code ?? "";

  async function add() {
    setErr("");
    if (!departmentId) {
      setErr("Pick a department.");
      return;
    }
    const n = parseInt(number, 10);
    if (!Number.isFinite(n) || n <= 0) {
      setErr("Enter the real clinic number.");
      return;
    }
    setBusy(true);
    try {
      await createClinic({ departmentId, number: n, name });
      setNumber("");
      setName("");
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't create clinic.");
    } finally {
      setBusy(false);
    }
  }

  const noDepartments = departments.length === 0;

  return (
    <section className="glass rounded-3xl p-7">
      <h2 className="mb-1 text-xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
        Clinics
      </h2>
      <p className="mb-4 text-xs text-slate-400">
        Type the real room number. The department code is added automatically.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {clinics.length === 0 && <p className="text-sm text-slate-500">No clinics yet.</p>}
        {clinics.map((c) => (
          <span key={c.id} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-slate-200">
            {clinicLabel(codeFor(c.departmentId), c.number)}
            {c.name ? <span className="text-slate-500"> · {c.name}</span> : null}
          </span>
        ))}
      </div>

      {noDepartments ? (
        <p className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-400">
          Create a department first.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="rounded-lg border border-slate-600 bg-(--color-navy) px-3 py-2 text-sm text-white outline-none focus:border-(--color-emerald) focus:ring-1 focus:ring-(--color-emerald)"
            >
              <option value="">Department…</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code}
                </option>
              ))}
            </select>
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Room no. (258)"
              inputMode="numeric"
              className="w-full rounded-lg border border-slate-600 bg-(--color-navy) px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-(--color-emerald) focus:ring-1 focus:ring-(--color-emerald) sm:w-32"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (optional)"
              className="flex-1 rounded-lg border border-slate-600 bg-(--color-navy) px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-(--color-emerald) focus:ring-1 focus:ring-(--color-emerald)"
            />
            <button
              onClick={add}
              disabled={busy}
              className="rounded-lg border border-(--color-emerald)/40 px-4 py-2 text-sm font-semibold text-(--color-emerald) transition hover:bg-(--color-emerald)/10 disabled:opacity-60"
            >
              Add
            </button>
          </div>
          {departmentId && number && (
            <p className="mt-2 text-xs text-slate-400">
              Will be created as{" "}
              <span className="font-semibold text-(--color-emerald)">
                {clinicLabel(codeFor(departmentId), parseInt(number, 10) || 0)}
              </span>
            </p>
          )}
        </>
      )}
      {err && <p className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{err}</p>}
    </section>
  );
}

/* ---------------- Create user ---------------- */

function CreateUserCard({
  departments,
  clinics,
  onCreated,
}: {
  departments: Department[];
  clinics: Clinic[];
  onCreated: () => void;
}) {
  const [displayName, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("clinic");
  const [clinicId, setClinicId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const codeFor = (id: string) => departments.find((d) => d.id === id)?.code ?? "";

  async function submit() {
    setMsg(null);
    if (!displayName || !email || !password) {
      setMsg({ ok: false, text: "Fill in name, email, and password." });
      return;
    }
    if (password.length < 6) {
      setMsg({ ok: false, text: "Password must be at least 6 characters." });
      return;
    }
    if (role === "clinic" && !clinicId) {
      setMsg({ ok: false, text: "Pick a clinic for a clinic user." });
      return;
    }
    const clinic = clinics.find((c) => c.id === clinicId);
    setBusy(true);
    try {
      await createUserWithRole({
        email,
        password,
        displayName,
        role,
        clinicId: role === "clinic" ? clinicId : null,
        departmentId: role === "clinic" ? clinic?.departmentId ?? null : null,
      });
      setMsg({ ok: true, text: `Created ${displayName} (${ROLE_LABEL[role]}).` });
      setName("");
      setEmail("");
      setPassword("");
      setClinicId("");
      onCreated();
    } catch (err) {
      if (err instanceof FirebaseError && err.code === "auth/email-already-in-use") {
        setMsg({ ok: false, text: "That email is already registered." });
      } else if (err instanceof FirebaseError) {
        setMsg({ ok: false, text: `Couldn't create user (${err.code}).` });
      } else {
        setMsg({ ok: false, text: "Couldn't create user. Try again." });
      }
    } finally {
      setBusy(false);
    }
  }

  const noClinics = clinics.length === 0;

  return (
    <section className="glass rounded-3xl p-7">
      <h2 className="mb-5 text-2xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
        Add a user
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <LabeledInput label="Full name" value={displayName} onChange={setName} placeholder="Dr. Jane Smith" />
        <LabeledInput label="Email" type="email" value={email} onChange={setEmail} placeholder="jane@health.sa" />
        <LabeledInput label="Temporary password" value={password} onChange={setPassword} placeholder="min 6 characters" />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-200">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full rounded-lg border border-slate-600 bg-(--color-navy) px-3 py-2.5 text-sm text-white outline-none focus:border-(--color-emerald) focus:ring-1 focus:ring-(--color-emerald)"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {role === "clinic" && (
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium text-slate-200">Clinic</label>
          {noClinics ? (
            <p className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-400">
              Create a clinic first (above).
            </p>
          ) : (
            <select
              value={clinicId}
              onChange={(e) => setClinicId(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-(--color-navy) px-3 py-2.5 text-sm text-white outline-none focus:border-(--color-emerald) focus:ring-1 focus:ring-(--color-emerald)"
            >
              <option value="">Select a clinic…</option>
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>
                  {clinicLabel(codeFor(c.departmentId), c.number)}
                  {c.name ? ` · ${c.name}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {role !== "clinic" && (
        <p className="mt-4 rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-400">
          {ROLE_LABEL[role]} is hospital-wide — serves every department, no clinic assignment.
        </p>
      )}

      {msg && (
        <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
          {msg.text}
        </p>
      )}

      <button
        onClick={submit}
        disabled={busy}
        className="mt-5 w-full rounded-lg bg-(--color-emerald) py-2.5 text-sm font-semibold text-(--color-navy) transition hover:bg-(--color-emerald-soft) disabled:opacity-60 sm:w-auto sm:px-8"
      >
        {busy ? "Creating…" : "Create user"}
      </button>
      <p className="mt-3 text-xs text-slate-500">
        Creating a user won&apos;t sign you out — it runs in an isolated session.
      </p>
    </section>
  );
}

/* ---------------- Users list ---------------- */

function UsersList({
  users,
  departments,
  clinics,
  loading,
}: {
  users: AppUser[];
  departments: Department[];
  clinics: Clinic[];
  loading: boolean;
}) {
  const codeFor = (id: string) => departments.find((d) => d.id === id)?.code ?? "";
  const clinicText = (u: AppUser) => {
    if (!u.clinicId) return "—";
    const c = clinics.find((x) => x.id === u.clinicId);
    return c ? clinicLabel(codeFor(c.departmentId), c.number) : "—";
  };

  return (
    <section className="glass rounded-3xl p-7">
      <h2 className="mb-4 text-xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
        Existing users
      </h2>
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-slate-500">No users yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Clinic</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map((u) => (
                <tr key={u.uid} className="text-slate-200">
                  <td className="px-4 py-2.5">{u.displayName}</td>
                  <td className="px-4 py-2.5 text-slate-400">{u.email}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-(--color-emerald)/15 px-2 py-0.5 text-xs text-(--color-emerald)">
                      {ROLE_LABEL[u.role]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">{clinicText(u)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-200">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-600 bg-(--color-navy) px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-(--color-emerald) focus:ring-1 focus:ring-(--color-emerald)"
      />
    </div>
  );
}
