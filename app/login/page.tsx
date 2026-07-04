// app/login/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { auth } from "@/lib/firebase/config";
import { useAuth } from "@/lib/hooks/useAuth";
import { ROLE_HOME } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const { appUser, loading, profileMissing } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Already signed in with a valid profile → send to the right dashboard.
  useEffect(() => {
    if (!loading && appUser) router.replace(ROLE_HOME[appUser.role]);
  }, [appUser, loading, router]);

  // Authenticated but no users/{uid} doc — the old silent-bounce case, now visible.
  useEffect(() => {
    if (profileMissing) {
      setError(
        "Your account exists but has no profile yet. Ask the admin to finish setting up your account (add a users record with your role)."
      );
      // Sign back out so the form is usable rather than stuck in a half-logged-in state.
      signOut(auth).catch(() => {});
    }
  }, [profileMissing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // No verification check. useAuth() loads the profile and the effect above
      // routes by role. If the profile is missing, profileMissing handles it.
    } catch (err) {
      // Surface the actual reason rather than a blanket "invalid" message.
      if (err instanceof FirebaseError) {
        switch (err.code) {
          case "auth/invalid-credential":
          case "auth/wrong-password":
          case "auth/user-not-found":
            setError("Wrong email or password.");
            break;
          case "auth/invalid-email":
            setError("That email address isn't valid.");
            break;
          case "auth/user-disabled":
            setError("This account has been disabled. Contact the admin.");
            break;
          case "auth/too-many-requests":
            setError("Too many attempts. Wait a moment and try again.");
            break;
          default:
            setError(`Couldn't sign in (${err.code}).`);
        }
      } else {
        setError("Couldn't sign in. Try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-(--color-navy) px-4 py-12">
      <main className="w-full max-w-sm">
        <h1 className="sr-only">EndoEquip Supply — Sign in</h1>

        <div className="mb-8 text-center">
          <div className="mb-3 flex items-center justify-center gap-3">
            <span className="text-[2.4rem] leading-none">🦋</span>
            <span className="text-white">
              <span className="text-[1.5rem] font-normal">Endo</span>
              <strong className="text-[1.5rem] font-extrabold">Equip</strong>
            </span>
          </div>
          <p className="text-sm text-(--color-emerald)">
            Supply coordination for the endodontic clinics
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="glass rounded-2xl p-7 shadow-xl"
        >
          <div className="mb-6 text-center">
            <h2
              className="text-2xl font-semibold text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Welcome back
            </h2>
            <p className="mt-1 text-xs text-slate-400">Authorized staff only</p>
          </div>

          <div className="mb-4">
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-200">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-(--color-navy) px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-(--color-emerald) focus:ring-1 focus:ring-(--color-emerald)"
              placeholder="you@health.sa"
            />
          </div>

          <div className="mb-5">
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-200">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-(--color-navy) px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-(--color-emerald) focus:ring-1 focus:ring-(--color-emerald)"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="mb-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || loading}
            className="w-full rounded-lg bg-(--color-emerald) py-2.5 text-sm font-semibold text-(--color-navy) transition hover:bg-(--color-emerald-soft) disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign In"}
          </button>

          <p className="mt-5 text-center text-xs text-slate-400">
            Need access? Contact the Endodontic Department Admin.
          </p>
        </form>

        <footer className="mt-8 text-center text-xs leading-relaxed text-slate-500">
          <p>endoprognosis project 2026. All rights reserved.</p>
          <p className="mt-1">Designed and created by Ali Addokhi.</p>
        </footer>
      </main>
    </div>
  );
}
