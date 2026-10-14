"use client";

import { usePowerSync, useQuery, useStatus } from "@powersync/react";
import {
  CalendarDays,
  ClipboardPlus,
  // FlaskConical,
  LayoutDashboard,
  LayoutTemplate,
  Menu,
  Microscope,
  Monitor,
  Pill,
  Settings,
  Users,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import { startVisit } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import { useChambers, useDoctors, useMyProfile } from "@/lib/doctor/hooks";
import { Link, navigate, useHashRoute } from "@/lib/doctor/router";
import { today } from "@/lib/doctor/util";
import type { Rejected } from "@/lib/powersync/connector";
import { disconnectForChamberSwitch, disconnectSession } from "@/lib/powersync/provider";
import { useCustomSync } from "@/lib/powersync/custom-sync";
import { clinicDataReady, downloadPercent } from "@/lib/powersync/sync-ready";
import { usePatientSearch } from "./patient-search";

const NewPatientModal = dynamic(() => import("./patient-form").then((m) => m.NewPatientModal));

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
      <summary className="badge cursor-pointer bg-red-100 text-alert">{items.length} change{items.length > 1 ? "s" : ""} not saved</summary>
      <div className="absolute right-0 z-40 mt-1 w-80 rounded-md border border-red-200 bg-white p-2 text-xs shadow-lg">
        <ul className="space-y-1">{items.map((r, i) => <li key={i}><b>{r.table}</b>: {r.reason}</li>)}</ul>
        <button className="btn-ghost mt-1 text-xs" onClick={() => setItems([])}>Dismiss</button>
      </div>
    </details>
  );
}

function SyncBadge() {
  const status = useStatus();
  const custom = useCustomSync();
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
  const connected = custom.mode === "custom" ? online && !custom.error : status.connected && online;
  const clinicReady = clinicDataReady(status) || custom.clinicReady;
  const fullSynced = custom.mode === "custom" ? custom.fullReady : !!status.hasSynced;
  const pct = downloadPercent(status);
  const label = custom.mode === "custom" && custom.syncing
    ? "Syncing…"
    : custom.mode === "custom" && custom.error
      ? "Sync failed"
      : !clinicReady
    ? pct != null ? `Clinic ${pct}%…` : "Loading clinic…"
    : !fullSynced
      ? pct != null ? `Medicines ${pct}%…` : "Loading medicines…"
      : connected
        ? pending ? `Syncing ${pending}…` : "Synced"
        : pending ? `Offline · ${pending}` : "Offline";
  const color = !connected
    ? "bg-amber-100 text-warn"
    : pending || !fullSynced
      ? "bg-blue-100 text-blue-800"
      : "bg-green-100 text-green-800";
  return (
    <span data-testid="sync-status" className={`badge ${color}`} title={custom.error ?? status.dataFlowStatus?.uploadError?.message ?? ""}>
      <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${connected ? "bg-current" : "bg-amber-500"}`} />
      {label}
    </span>
  );
}

function LiveClock() {
  // First paint stays empty so SSR and hydration match. The clock starts after mount.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  const date = now ? today() : "\u00a0";
  const time = now ? now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "\u00a0";
  return (
    <div className="hidden text-right text-xs text-slate-500 sm:block">
      <div className="font-medium tabular-nums text-slate-700">{time}</div>
      <div className="tabular-nums">{date}</div>
    </div>
  );
}

function HeaderSearch() {
  const db = usePowerSync();
  const session = useSession();
  const { current: chamber } = useChambers();
  const doctors = useDoctors();
  const [q, setQ] = useState("");
  const { data } = usePatientSearch(q, 6);
  const isDoctor = session.tenantRole === "doctor";

  async function start(patientId: string) {
    const doctorId = isDoctor ? session.userId : doctors[0]?.id;
    if (!doctorId) return alert("No doctor in this chamber yet.");
    const id = await startVisit(db, {
      tenantId: session.tenantId,
      userId: session.userId,
      patientId,
      doctorUserId: doctorId,
      chamberId: chamber?.id ?? null,
      specialtyCode: doctors.find((d) => d.id === doctorId)?.specialty_code ?? "general",
      asDoctor: isDoctor,
    });
    setQ("");
    navigate(`/visit/${id}`);
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        id="header-patient-search"
        className="input h-8 bg-slate-50"
        placeholder="Search name, mobile or ID"
        title="Search by name, mobile or patient ID. Press / to focus."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQ("");
            (e.target as HTMLInputElement).blur();
          }
        }}
        data-testid="header-patient-search"
      />
      {q.trim().length >= 2 && (
        <ul className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {data.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-slate-50">
              <Link to={`/patients/${p.id}`} className="min-w-0 truncate hover:underline" onClick={() => setQ("")}>
                <b>{p.name}</b> <span className="text-slate-500">{p.mobile} · {p.code}</span>
              </Link>
              <button type="button" className="btn-secondary shrink-0 px-2 py-0.5 text-xs" onClick={() => void start(p.id)}>
                {isDoctor ? "Rx" : "Queue"}
              </button>
            </li>
          ))}
          {!data.length && (
            <li className="px-3 py-2 text-slate-500">
              No match. <Link to="/patients/new" className="text-brand-700 underline" onClick={() => setQ("")}>New patient</Link>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function PlanBanner() {
  const { planExpiresAt, tenantRole } = useSession();
  if (!planExpiresAt || tenantRole === "assistant") return null;
  const days = Math.ceil((new Date(`${planExpiresAt}T23:59:59`).getTime() - Date.now()) / 86400000);
  if (days > 7) return null;
  return (
    <div className={`shrink-0 px-4 py-1.5 text-center text-sm print:hidden ${days < 0 ? "bg-red-50 text-alert" : "bg-amber-50 text-warn"}`}>
      {days < 0
        ? `Subscription expired on ${planExpiresAt}. Sync and SMS are paused until you renew.`
        : `Subscription ends in ${days} day${days === 1 ? "" : "s"} (${planExpiresAt}).`}{" "}
      <a href="#/settings" className="underline">Renew</a>
    </div>
  );
}

function ChamberSwitcher() {
  const session = useSession();
  const profile = useMyProfile();
  // Profile name is synced, so a rename shows here without a new login. Assistants keep the clinic name.
  const label = (session.tenantRole === "doctor" ? profile?.name_en?.trim() : "") || (session.tenantRole === "doctor" ? session.name : session.tenantName);
  const [open, setOpen] = useState(false);
  const [chambers, setChambers] = useState<{ tenantId: string; name: string; role: string; current: boolean }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/switch-chamber")
      .then((r) => r.json())
      .then((j) => setChambers(j.chambers ?? []))
      .catch(() => setChambers([]));
  }, []);

  async function switchTo(tenantId: string) {
    if (tenantId === session.tenantId || busy) return;
    setBusy(true);
    try {
      await disconnectForChamberSwitch();
      const res = await fetch("/api/auth/switch-chamber", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? "Could not switch chamber");
        setBusy(false);
        return;
      }
      window.location.href = "/doctor";
    } catch {
      setBusy(false);
      alert("Could not switch chamber");
    }
  }

  if (chambers.length <= 1 && !open) {
    return <span className="block truncate text-sm font-medium text-slate-800" title={label} data-testid="header-doctor-name">{label}</span>;
  }

  return (
    <details className="relative" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer list-none truncate text-sm text-slate-600 hover:text-slate-900" title="Switch clinic">
        {label} ▾
      </summary>
      <div className="absolute left-0 z-40 mt-1 w-64 rounded-md border border-slate-200 bg-white p-2 text-xs shadow-lg">
        <p className="mb-1 px-1 font-medium text-slate-700">Your clinics</p>
        <ul className="space-y-1">
          {(chambers.length ? chambers : [{ tenantId: session.tenantId, name: session.tenantName, role: session.tenantRole, current: true }]).map((c) => (
            <li key={c.tenantId}>
              <button
                type="button"
                disabled={c.current || busy}
                className={`w-full rounded px-2 py-1.5 text-left ${c.current ? "bg-brand-50 text-brand-800" : "hover:bg-slate-50"}`}
                onClick={() => switchTo(c.tenantId)}
              >
                <b>{c.name}</b>
                <span className="block text-slate-500">{c.role}{c.current ? " · current" : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

type NavItem = { to: string; label: string; match: boolean; icon: ReactNode };

export function DoctorShell({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const route = useHashRoute();
  const profile = useMyProfile();
  const isDoctor = session.tenantRole === "doctor";
  const [signingOut, setSigningOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [newPatientOpen, setNewPatientOpen] = useState(false);
  const date = today();

  const { data: queueStats } = useQuery<{ waiting: number | null; active: number | null; done: number | null; total: number | null }>(
    `SELECT
        coalesce(sum(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END), 0) AS waiting,
        coalesce(sum(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END), 0) AS active,
        coalesce(sum(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0) AS done,
        count(*) AS total
       FROM encounter
      WHERE visit_date = ? AND status <> 'cancelled' ${isDoctor ? "AND doctor_user_id = ?" : ""}`,
    isDoctor ? [date, session.userId] : [date],
  );
  const qs = {
    waiting: queueStats[0]?.waiting ?? 0,
    active: queueStats[0]?.active ?? 0,
    done: queueStats[0]?.done ?? 0,
  };

  const home: NavItem[] = [
    { to: "/", label: "Dashboard", match: route.length === 0, icon: <LayoutDashboard className="h-4 w-4 shrink-0" /> },
    { to: "/patients/new", label: "New prescription", match: route[0] === "patients" && route[1] === "new", icon: <ClipboardPlus className="h-4 w-4 shrink-0" /> },
    { to: "/patients", label: "Patients", match: route[0] === "patients" && route[1] !== "new", icon: <Users className="h-4 w-4 shrink-0" /> },
    { to: "/bookings", label: "Bookings", match: route[0] === "bookings", icon: <CalendarDays className="h-4 w-4 shrink-0" /> },
  ];
  const clinical: NavItem[] = [
    // { to: "/lab", label: "Lab", match: route[0] === "lab", icon: <FlaskConical className="h-4 w-4 shrink-0" /> },
    { to: "/investigations", label: "Investigations", match: route[0] === "investigations", icon: <Microscope className="h-4 w-4 shrink-0" /> },
    { to: "/medicines", label: "Medicines", match: route[0] === "medicines", icon: <Pill className="h-4 w-4 shrink-0" /> },
  ];
  const practice: NavItem[] = [
    ...(isDoctor ? [{ to: "/templates", label: "Templates", match: route[0] === "templates", icon: <LayoutTemplate className="h-4 w-4 shrink-0" /> }] : []),
    ...(session.tenantRole !== "assistant" ? [{ to: "/settings", label: "Settings", match: route[0] === "settings", icon: <Settings className="h-4 w-4 shrink-0" /> }] : []),
  ];

  useEffect(() => {
    setMobileOpen(false);
  }, [route.join("/")]);

  // `/` focuses patient search; Esc closes the mobile drawer. Skip when typing in fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !typing) {
        e.preventDefault();
        document.getElementById("header-patient-search")?.focus();
      }
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    const logout = fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    const leave = disconnectSession().catch(() => null);
    const forgetShell = navigator.serviceWorker?.getRegistration?.().then((reg) => reg?.active?.postMessage({ clearShell: true })).catch(() => null);
    await Promise.race([Promise.all([logout, leave, forgetShell]), new Promise((r) => setTimeout(r, 2500))]);
    window.location.href = "/login";
  }

  const linkClass = (on: boolean) =>
    `flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition ${
      on ? "bg-brand-600 font-medium text-white shadow-sm" : "text-slate-300 hover:bg-white/10 hover:text-white"
    }`;

  const NavGroup = ({ title, items }: { title: string; items: NavItem[] }) =>
    items.length ? (
      <div className="space-y-0.5">
        <p className="px-2.5 pb-0.5 pt-2 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">{title}</p>
        {items.map((n) => (
          <Link key={n.to} to={n.to} className={linkClass(n.match)} onClick={() => setMobileOpen(false)}>
            {n.icon}
            {n.label}
          </Link>
        ))}
      </div>
    ) : null;

  const specialty = profile?.specialty_code?.replace(/_/g, " ") ?? session.tenantRole;
  const doctorLabel = profile?.name_en ?? session.name;

  const sidebar = (
    <>
      <div className="border-b border-white/10 px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-base font-semibold tracking-tight text-white">RxPad</span>
          <span className="rounded bg-sakura-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-white uppercase">Clinic</span>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-1.5 pb-2" aria-label="Main">
        <NavGroup title="Home" items={home} />
        <NavGroup title="Clinical" items={clinical} />
        <NavGroup title="Practice" items={practice} />
        <div className="mt-2 space-y-0.5 border-t border-white/10 pt-2">
          <a href="#/display" className={linkClass(route[0] === "display")} onClick={() => setMobileOpen(false)}>
            <Monitor className="h-4 w-4 shrink-0" />
            Display
          </a>
        </div>
      </nav>
      <div className="relative overflow-hidden border-t border-white/10 p-2">
        <p className="truncate px-2 text-sm font-medium text-white" title={doctorLabel}>{doctorLabel}</p>
        <p className="truncate px-2 text-xs capitalize text-slate-400">{specialty}</p>
        <button
          type="button"
          disabled={signingOut}
          onClick={() => void signOut()}
          data-lpignore="true"
          data-1p-ignore="true"
          data-bwignore="true"
          data-form-type="other"
          data-testid="sign-out"
          className="relative z-0 w-full rounded-md px-2 py-1.5 text-left text-xs text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-50 [&::-webkit-credentials-auto-fill-button]:hidden [&::-webkit-contacts-auto-fill-button]:hidden"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </>
  );

  return (
    <div className="h-dvh overflow-hidden bg-slate-100">
      <aside className={`fixed inset-y-0 left-0 z-40 w-52 flex-col bg-[#0a3d39] print:hidden ${sidebarOpen ? "hidden md:flex" : "hidden"}`}>
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 print:hidden md:hidden">
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-60 max-w-[85vw] flex-col bg-[#0a3d39] shadow-xl">
            <button type="button" className="absolute top-2.5 right-2.5 rounded p-1 text-slate-300 hover:bg-white/10" aria-label="Close" onClick={() => setMobileOpen(false)}>
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className={`flex h-dvh flex-col ${sidebarOpen ? "md:pl-52" : ""}`}>
        <header className="z-30 shrink-0 border-b border-slate-200 bg-white print:hidden">
          <div className="flex h-12 items-center gap-2 px-3">
            <button
              type="button"
              className="shrink-0 rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
              aria-label="Menu"
              data-testid="drawer-menu"
              onClick={() => {
                if (window.matchMedia("(min-width: 768px)").matches) setSidebarOpen((open) => !open);
                else setMobileOpen(true);
              }}
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden w-44 shrink-0 sm:block">
              <ChamberSwitcher />
            </div>
            <HeaderSearch />
            <button type="button" className="btn-primary h-8 shrink-0 whitespace-nowrap px-2.5 text-xs" data-testid="new-appointment" onClick={() => setNewPatientOpen(true)}>
              New appointment
            </button>
            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden h-8 items-center overflow-hidden rounded-md border border-slate-200 text-[11px] font-medium sm:flex" data-testid="queue-status">
                <span className="flex h-full items-center bg-amber-50 px-2 text-amber-900 tabular-nums" title="Waiting">{qs.waiting}<span className="ml-1 hidden font-normal lg:inline">waiting</span></span>
                <span className="flex h-full items-center border-l border-slate-200 bg-blue-50 px-2 text-blue-900 tabular-nums" title="In room">{qs.active}<span className="ml-1 hidden font-normal lg:inline">in room</span></span>
                <span className="flex h-full items-center border-l border-slate-200 bg-green-50 px-2 text-green-900 tabular-nums" title="Seen">{qs.done}<span className="ml-1 hidden font-normal lg:inline">seen</span></span>
              </div>
              <LiveClock />
              <RejectedNotice />
              <SyncBadge />
            </div>
          </div>
        </header>
        <PlanBanner />
        <main className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col overflow-x-hidden overflow-y-auto p-2 sm:p-2.5 lg:h-0 lg:p-3 xl:[&:has([data-visit-fill])]:overflow-hidden">
          <div className="flex flex-col lg:min-h-0 lg:flex-1 xl:[&:has([data-visit-fill])]:overflow-hidden">
            {children}
          </div>
        </main>
      </div>
      {newPatientOpen && <NewPatientModal open onClose={() => setNewPatientOpen(false)} />}
    </div>
  );
}
