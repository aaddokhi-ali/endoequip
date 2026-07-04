// components/HubStub.tsx
"use client";

import { ReactNode } from "react";

/** A placeholder panel for features arriving in later build steps. */
export default function HubStub({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section className="glass rounded-3xl p-8">
      <p className="mb-2 text-[11px] uppercase tracking-[3px] text-(--color-emerald)/70">
        {eyebrow}
      </p>
      <h2
        className="mb-3 text-3xl font-semibold text-white"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h2>
      <p className="max-w-xl leading-relaxed text-slate-300">{description}</p>
      {children && <div className="mt-6">{children}</div>}
      <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full bg-(--color-gold)" />
        Coming in a later build step
      </div>
    </section>
  );
}
