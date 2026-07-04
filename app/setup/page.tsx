// app/setup/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { anyUserExists, createFirstAdmin } from "@/lib/data/adminApi";

type Phase = "checking" | "locked" | "form" | "creating" | "done";

export default function SetupPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [displayName, setDisplayName] = useState("Dr. Ali Addokhi");
  const [email, setEmail] = useState("aaddokhi@endoprognosis.org");
  const [password, setPassword] = useState("Test1234!");
  const [error, setError] = useState("");

  useEffect(() => {
    anyUserExists()
      .then((exists) => setPhase(exists ? "locked" : "form"))
      .catch(() => setPhase("form")); // if the check fails, allow the attempt
  }, []);

  async function handleCreate() {
    setError("");
    if (!displayName || !email || !password) {
      setError("Fill in every field.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setPhase("creating");
    try {
      // Guard against a race: re-check right before creating.
      if (await anyUserExists()) {
        setPhase("locked");
        return;
      }
      await createFirstAdmin({ email, password, displayName });
      setPhase("done");
    } catch (err) {
      if (err instanceof FirebaseError && err.code === "auth/email-already-in-use") {
        setError(
          "That email already has an auth account, but no profile. Delete it in Firebase console → Authentication, then try again."
        );
      } else if (err instanceof FirebaseError) {
        setError(`Couldn't create admin (${err.code}).`);
      } else {
        setError("Couldn't create admin. Check your Firebase config and rules.");
      }
      setPhase("form");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--color-navy) px-4 py-12">
      <main className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-3 flex items-center justify-center gap-3">
            <span className="text-[2.4rem] leading-none">🦋</span>
            <span className="text-white">
              <span className="text-[1.5rem] font-normal">Endo</span>
              <strong className="text-[1.5rem] font-extrabold">Equip</strong>
            </span>
          </div>
          <p className="text-sm text-(--color-emerald)">First-time setup</p>
        </div>

        <div className="glass rounded-2xl p-7 shadow-xl">
          {phase === "checking" && (
            <p className="text-center text-sm text-slate-400">Checking setup status…</p>
          )}

          {phase === "locked" && (
            <div className="text-center">
              <h2
                className="mb-2 text-2xl font-semibold text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Setup already complete
              </h2>
              <p className="mb-6 text-sm text-slate-400">
                An admin already exists. This page is disabled. Manage users from the
                Admin panel after signing in.
              </p>
              <button
                onClick={() => router.replace("/login")}
                className="rounded-lg bg-(--color-emerald) px-6 py-2.5 text-sm font-semibold text-(--color-navy) transition hover:bg-(--color-emerald-soft)"
              >
                Go to sign in
              </button>
            </div>
          )}

          {phase === "done" && (
            <div className="text-center">
              <h2
                className="mb-2 text-2xl font-semibold text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Admin created
              </h2>
              <p className="mb-6 text-sm text-slate-400">
                Sign in with your new admin account, then set up your departments,
                clinics, and staff from the Admin panel.
              </p>
              <button
                onClick={() => router.replace("/login")}
                className="rounded-lg bg-(--color-emerald) px-6 py-2.5 text-sm font-semibold text-(--color-navy) transition hover:bg-(--color-emerald-soft)"
              >
                Go to sign in
              </button>
            </div>
          )}

          {(phase === "form" || phase === "creating") && (
            <>
              <div className="mb-6 text-center">
                <h2
                  className="text-2xl font-semibold text-white"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Create the first admin
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  This runs once, then locks itself.
                </p>
              </div>

              <Field label="Full name" value={displayName} onChange={setDisplayName} />
              <Field label="Email" type="email" value={email} onChange={setEmail} />
              <Field label="Password" type="password" value={password} onChange={setPassword} />

              {error && (
                <p className="mb-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300" role="alert">
                  {error}
                </p>
              )}

              <button
                onClick={handleCreate}
                disabled={phase === "creating"}
                className="w-full rounded-lg bg-(--color-emerald) py-2.5 text-sm font-semibold text-(--color-navy) transition hover:bg-(--color-emerald-soft) disabled:opacity-60"
              >
                {phase === "creating" ? "Creating…" : "Create admin & initialize"}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-sm font-medium text-slate-200">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-600 bg-(--color-navy) px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-(--color-emerald) focus:ring-1 focus:ring-(--color-emerald)"
      />
    </div>
  );
}
