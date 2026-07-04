// lib/firebase/secondary.ts
//
// Creating a user with createUserWithEmailAndPassword on the primary auth
// instance signs you in AS that new user — which would kick an admin out of
// their own session. To avoid that, we spin up a SECONDARY Firebase app just
// for user creation, then throw it away. The admin's primary session is never
// touched.

import { initializeApp, deleteApp, getApp, getApps } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "build-placeholder-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "build-placeholder.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "build-placeholder",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "build-placeholder-app-id",
};

/**
 * Create an auth account without disturbing the current (admin) session.
 * Returns the new user's uid. The caller is responsible for writing the
 * matching users/{uid} profile doc via the PRIMARY db instance.
 */
export async function createAuthUserIsolated(
  email: string,
  password: string
): Promise<string> {
  const name = "secondary-user-creation";
  const secondaryApp =
    getApps().find((a) => a.name === name) ??
    initializeApp(firebaseConfig, name);

  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
    const uid = cred.user.uid;
    // Sign the new user out of the secondary instance; don't block on it.
    signOut(secondaryAuth).catch(() => {});
    return uid;
  } finally {
    // Tear down the secondary app after a beat so cleanup never surfaces as an error.
    setTimeout(() => {
      try {
        deleteApp(getApp(name));
      } catch {
        /* already gone — fine */
      }
    }, 500);
  }
}
