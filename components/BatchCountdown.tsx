// components/BatchCountdown.tsx
// Live countdown to the next sterilization batch. Ticks client-side
// from a stored timestamp — no server involvement.
"use client";

import { useEffect, useState } from "react";

export default function BatchCountdown({ readyAt }: { readyAt: Date }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remainingMs = readyAt.getTime() - now;

  if (remainingMs <= 0) {
    return (
      <div className="rounded-2xl border border-emerald/40 bg-emerald/10 px-4 py-3">
        <p className="text-sm font-semibold text-emerald">
          ✓ Sterilization batch ready — units available for collection
        </p>
      </div>
    );
  }

  const totalSec = Math.floor(remainingMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const timeText =
    h > 0
      ? `${h}h ${String(m).padStart(2, "0")}m`
      : `${m}:${String(s).padStart(2, "0")}`;
  const readyClock = readyAt.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
      <p className="text-sm text-amber-200">
        <span className="font-semibold">Next batch in {timeText}</span>
        <span className="text-amber-200/70"> · ready at {readyClock}</span>
      </p>
    </div>
  );
}