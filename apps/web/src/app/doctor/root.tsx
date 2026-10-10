"use client";

import { useEffect } from "react";
import { DoctorShell } from "@/components/doctor/shell";
import { SessionProvider, type ClientSession } from "@/lib/doctor/context";
import { PowerSyncProvider } from "@/lib/powersync/provider";

export function DoctorRoot({ session, children }: { session: ClientSession; children: React.ReactNode }) {
  useEffect(() => {
    // Offline app shell. Disabled in `next dev`, where the service worker would cache stale bundles.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then((reg) => {
          const urls = performance.getEntriesByType("resource").map((e) => e.name);
          reg.active?.postMessage({ cacheUrls: urls });
        })
        .catch((e) => console.warn("SW registration failed", e));
    }
  }, []);
  return (
    <SessionProvider value={session}>
      <PowerSyncProvider userId={session.userId} tenantId={session.tenantId}>
        <DoctorShell>{children}</DoctorShell>
      </PowerSyncProvider>
    </SessionProvider>
  );
}
