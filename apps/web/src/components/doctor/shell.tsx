"use client";

import { useQuery, useStatus } from "@powersync/react";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/doctor/context";
import { Link, useHashRoute } from "@/lib/doctor/router";
import type { Rejected } from "@/lib/powersync/connector";
import { disconnectAndClear } from "@/lib/powersync/provider";

function RejectedNotice() {
  const [items, setItems] = useState<Rejected[]>([]);
  useEffect(() => {
    const on = (e: Event) => setItems((prev) => [...prev, ...(e as CustomEvent<Rejected[]>).detail].slice(-20));
    window.addEventListener("rx-sync-rejected", on);
    return () => window.removeEventListener("rx-sync-rejected", on);
  }, []);
  if (!items.length) return null;
  return (
    <details className="relative" data-testid="sync-rejected">
      <summary className="badge cursor-pointer bg-red-100 text-red-800">{items.length} change{items.length > 1 ? "s" : ""} not saved on server</summary>
      <div className="absolute right-0 z-40 mt-1 w-80 rounded-md border border-red-200 bg-white p-2 text-xs shadow-lg">
        <ul className="space-y-1">{items.map((r, i) => <li key={i}><b>{r.table}</b>: {r.reason}</li>)}</ul>
        <button className="btn-ghost mt-1 text-xs" onClick={() => setItems([])}>Dismiss</button>
      </div>
    </details>
  );
}

function SyncBadge() {
  const status = useStatus();
  const { data } = useQuery<{ n: number }>("SELECT count(*) AS n FROM ps_crud");
  const pending = data[0]?.n ?? 0;
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    on();
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  const connected = status.connected && online;
  const label = !status.hasSynced ? "Downloading data…" : connected ? (pending ? `Syncing ${pending}…` : "Synced") : pending ? `Offline · ${pending} unsynced` : "Offline";
  const color = !connected ? "bg-amber-100 text-amber-800" : pending || !status.hasSynced ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800";
  return (
    <span data-testid="sync-status" className={`badge ${color}`} title={status.dataFlowStatus?.uploadError?.message ?? ""}>
      <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${connected ? "bg-current" : "bg-amber-500"}`} />
      {label}
    </span>
  );
}

function PlanBanner() {
  const { planExpiresAt, tenantRole } = useSession();
  if (!planExpiresAt || tenantRole === "assistant") return null;
  const days = Math.ceil((new Date(`${planExpiresAt}T23:59:59`).getTime() - Date.now()) / 86400000);
  if (days > 7) return null;
  return (
    <div className={`px-4 py-1.5 text-center text-sm print:hidden ${days < 0 ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
      {days < 0 ? `Subscription expired on ${planExpiresAt}.` : `Subscription ends in ${days} day${days === 1 ? "" : "s"} (${planExpiresAt}).`}{" "}
      <a href="#/settings" className="underline">Renew</a> — your data stays safe either way.
    </div>
  );
}

export function DoctorShell({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const route = useHashRoute();
  const isDoctor = session.tenantRole === "doctor";
  const nav = [
    { to: "/", label: "Today", match: route.length === 0 },
    { to: "/patients", label: "Patients", match: route[0] === "patients" },
    { to: "/bookings", label: "Bookings", match: route[0] === "bookings" },
    ...(session.tenantRole !== "assistant" ? [{ to: "/reports", label: "Reports", match: route[0] === "reports" }] : []),
    ...(isDoctor ? [{ to: "/templates", label: "Templates", match: route[0] === "templates" }] : []),
    ...(session.tenantRole !== "assistant" ? [{ to: "/settings", label: "Settings", match: route[0] === "settings" }] : []),
  ];

  async function signOut() {
    // Remove the local copy of patient data from this browser before leaving.
    await disconnectAndClear();
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <span className="font-semibold text-brand-700">RxPad</span>
          <nav className="flex gap-1">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} className={`rounded-md px-3 py-1.5 text-sm ${n.match ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-100"}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <a href="#/display" className="text-xs text-slate-500 hover:text-slate-900" title="Waiting-room screen">Display</a>
            <RejectedNotice />
            <SyncBadge />
            <span className="hidden text-slate-500 sm:inline">{session.name} · {session.tenantRole}</span>
            <button onClick={signOut} className="text-xs text-slate-500 hover:text-slate-900">Sign out</button>
          </div>
        </div>
      </header>
      <PlanBanner />
      <main className="mx-auto max-w-7xl p-4">{children}</main>
    </div>
  );
}
