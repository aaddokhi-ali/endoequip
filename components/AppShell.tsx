// components/AppShell.tsx
"use client";

import { ReactNode, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/config";
import { useAuth } from "@/lib/hooks/useAuth";
import { Role } from "@/lib/types";
import ShortageAlert from "@/components/ShortageAlert";

interface NavLink {
  label: string;
  href: string;
}

// Which nav links each role sees.
const NAV_BY_ROLE: Record<Role, NavLink[]> = {
  clinic: [
    { label: "Order Hub", href: "/clinic/order" },
    { label: "Ready Hub", href: "/clinic/ready" },
  ],
  store: [
    { label: "Orders", href: "/store/orders" },
    { label: "Catalogue", href: "/store/catalogue" },
  ],
  sterilization: [{ label: "Ready Hub", href: "/sterilization/ready" }],
  admin: [
    { label: "Dashboard", href: "/admin/dashboard" },
    { label: "Orders", href: "/admin/orders" },
    { label: "Ready", href: "/admin/ready" },
    { label: "Insights", href: "/admin/insights" },
    { label: "Setup", href: "/admin/users" },
    { label: "Catalogue", href: "/admin/catalogue" },
  ],
};

const ROLE_LABEL: Record<Role, string> = {
  clinic: "Clinic",
  store: "Store",
  sterilization: "Sterilization",
  admin: "Admin",
};

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { appUser } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    await signOut(auth);
    router.replace("/login");
  }

  const links = appUser ? NAV_BY_ROLE[appUser.role] : [];

  return (
    <div className="min-h-screen bg-(--color-navy) text-white">
      <header className="border-b border-white/10 bg-black/30 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-4 sm:gap-6">
            <button
              onClick={() => appUser && router.push(NAV_BY_ROLE[appUser.role][0].href)}
              className="flex items-center gap-2"
            >
              <span className="text-xl leading-none">🦋</span>
              <span className="text-white">
                <span className="text-base font-normal">Endo</span>
                <strong className="text-base font-extrabold">Equip</strong>
              </span>
            </button>

            {/* Desktop nav */}
            <nav className="hidden items-center gap-1 sm:flex">
              {links.map((l, i) => {
                const active = pathname === l.href;
                return (
                  <button
                    key={`${l.href}-${i}`}
                    onClick={() => router.push(l.href)}
                    className={`rounded-lg px-3 py-1.5 text-sm transition ${
                      active
                        ? "bg-emerald/15 text-emerald"
                        : "text-slate-300 hover:text-white"
                    }`}
                  >
                    {l.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <p className="hidden text-xs text-slate-400 md:block">
              {new Date().toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            {appUser && (
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-white">{appUser.displayName}</p>
                <p className="text-[11px] uppercase tracking-wide text-emerald">
                  {ROLE_LABEL[appUser.role]}
                </p>
              </div>
            )}
            <button
              onClick={handleSignOut}
              className="hidden rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-300 transition hover:border-white/30 hover:text-white sm:block"
            >
              Sign out
            </button>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 text-xl text-slate-200 sm:hidden"
            >
              {menuOpen ? "✕" : "☰"}
            </button>
          </div>
        </div>

        {/* Mobile menu panel */}
        {menuOpen && (
          <div className="border-t border-white/10 px-4 pb-4 pt-2 sm:hidden">
            {appUser && (
              <div className="mb-2 flex items-center justify-between px-1 py-2">
                <div>
                  <p className="text-sm font-medium text-white">{appUser.displayName}</p>
                  <p className="text-[11px] uppercase tracking-wide text-emerald">
                    {ROLE_LABEL[appUser.role]}
                  </p>
                </div>
                <p className="text-xs text-slate-400">
                  {new Date().toLocaleDateString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </p>
              </div>
            )}
            <nav className="space-y-1">
              {links.map((l, i) => {
                const active = pathname === l.href;
                return (
                  <button
                    key={`m-${l.href}-${i}`}
                    onClick={() => router.push(l.href)}
                    className={`block w-full rounded-lg px-3 py-3 text-left text-base transition ${
                      active
                        ? "bg-emerald/15 font-semibold text-emerald"
                        : "text-slate-200 hover:bg-white/5"
                    }`}
                  >
                    {l.label}
                  </button>
                );
              })}
            </nav>
            <button
              onClick={handleSignOut}
              className="mt-3 w-full rounded-lg border border-white/15 px-3 py-3 text-base text-slate-300 transition hover:text-white"
            >
              Sign out
            </button>
          </div>
        )}
      </header>

      <ShortageAlert />

      <main className="mx-auto flex max-w-6xl flex-col px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}