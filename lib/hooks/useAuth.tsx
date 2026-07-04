// lib/hooks/useAuth.tsx
"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/config";
import { AppUser } from "@/lib/types";

/**
 * Auth state for the whole app.
 *
 * Why this is simple on purpose:
 * - No emailVerified check, no verification bounce, no resend flow (v1 decision).
 * - The ONLY thing that gates access is: do you have a users/{uid} doc with a role?
 * - If you authenticate but have no profile doc, we DON'T silently bounce you back
 *   to login (that was the old bug). We set `profileMissing` so the UI can tell you
 *   exactly what's wrong: your account exists but has no profile.
 */

interface AuthState {
  firebaseUser: User | null;
  appUser: AppUser | null;
  loading: boolean;
  profileMissing: boolean; // authenticated but no users/{uid} doc
}

const AuthContext = createContext<AuthState>({
  firebaseUser: null,
  appUser: null,
  loading: true,
  profileMissing: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileMissing, setProfileMissing] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setLoading(true);
      setProfileMissing(false);

      if (!fbUser) {
        setFirebaseUser(null);
        setAppUser(null);
        setLoading(false);
        return;
      }

      setFirebaseUser(fbUser);

      try {
        const snap = await getDoc(doc(db, "users", fbUser.uid));
        if (snap.exists()) {
          setAppUser({ uid: fbUser.uid, ...(snap.data() as Omit<AppUser, "uid">) });
          setProfileMissing(false);
        } else {
          // Account exists in Auth but no profile doc. This is the old bounce
          // cause — surface it instead of hiding it.
          setAppUser(null);
          setProfileMissing(true);
        }
      } catch {
        setAppUser(null);
        setProfileMissing(false);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  return (
    <AuthContext.Provider value={{ firebaseUser, appUser, loading, profileMissing }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
