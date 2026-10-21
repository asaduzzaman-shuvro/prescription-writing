"use client";

import { usePowerSync, useQuery, useStatus } from "@powersync/react";
import {
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ClipboardPlus,
  Clock,
  // FlaskConical,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Menu,
  Microscope,
  Monitor,
  Pill,
  Search,
  Settings,
  Sparkles,
  UserCheck,
  Users,
  UsersRound,
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
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-alert ring-1 ring-red-200/80 ring-inset">
        {items.length} unsaved
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200/80 bg-white p-2 text-xs shadow-xl ring-1 ring-slate-900/5">
        <ul className="space-y-1">{items.map((r, i) => <li key={i} className="rounded-lg px-1 py-0.5 hover:bg-slate-50"><b>{r.table}</b>: {r.reason}</li>)}</ul>
        <button className="btn-ghost mt-1.5 w-full text-xs" onClick={() => setItems([])}>Dismiss</button>
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
    <span
      data-testid="sync-status"
      className={`inline-flex max-w-[9.5rem] items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset sm:max-w-none ${color} ${
        !connected ? "ring-amber-200/80" : pending || !fullSynced ? "ring-blue-200/80" : "ring-green-200/80"
      }`}
      title={custom.error ?? status.dataFlowStatus?.uploadError?.message ?? ""}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${connected ? "bg-current" : "bg-amber-500"}`} />
      <span className="truncate">{label}</span>
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
    <div className="hidden items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/60 px-2 py-1 sm:flex">
      <Clock className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />
      <div className="text-right text-[11px] leading-tight text-slate-500">
        <div className="font-semibold tabular-nums text-slate-800">{time}</div>
        <div className="tabular-nums">{date}</div>
      </div>
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
      <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        id="header-patient-search"
        className="input h-8 rounded-lg border-slate-200/80 bg-slate-50/80 pr-8 pl-8 text-[13px] shadow-sm transition placeholder:text-slate-400 focus:bg-white"
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
      <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400 lg:inline">
        /
      </kbd>
      {q.trim().length >= 2 && (
        <ul className="absolute z-40 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-slate-200/80 bg-white py-1 text-sm shadow-xl ring-1 ring-slate-900/5">
          {data.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 px-2 py-0.5">
              <Link
                to={`/patients/${p.id}`}
                className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 hover:bg-slate-50"
                onClick={() => setQ("")}
              >
                <b>{p.name}</b> <span className="text-slate-500">{p.mobile} · {p.code}</span>
              </Link>
              <button type="button" className="btn-secondary shrink-0 rounded-lg px-2.5 py-1 text-xs" onClick={() => void start(p.id)}>
                {isDoctor ? "Rx" : "Queue"}
              </button>
            </li>
          ))}
          {!data.length && (
            <li className="px-3 py-2.5 text-slate-500">
              No match. <Link to="/patients/new" className="font-medium text-brand-700 underline" onClick={() => setQ("")}>New patient</Link>
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
    <div className={`shrink-0 border-b px-4 py-2 text-center text-sm print:hidden ${days < 0 ? "border-red-100 bg-red-50/90 text-alert" : "border-amber-100 bg-amber-50/90 text-warn"}`}>
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

  const chamberTriggerClass =
    "flex max-w-full min-w-0 items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/60 px-2 py-1 text-left shadow-sm transition hover:bg-white";

  if (chambers.length <= 1 && !open) {
    return (
      <div className={chamberTriggerClass} title={label} data-testid="header-doctor-name">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-100 text-brand-700" aria-hidden>
          <UsersRound className="h-3 w-3" />
        </span>
        <span className="min-w-0 truncate text-xs font-semibold text-slate-800">{label}</span>
      </div>
    );
  }

  return (
    <details className="relative min-w-0" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className={`${chamberTriggerClass} cursor-pointer list-none`} title="Switch clinic">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-100 text-brand-700" aria-hidden>
          <UsersRound className="h-3 w-3" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
      </summary>
      <div className="absolute left-0 z-40 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200/80 bg-white p-2 text-xs shadow-xl ring-1 ring-slate-900/5">
        <p className="px-2 py-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Your clinics</p>
        <ul className="space-y-0.5">
          {(chambers.length ? chambers : [{ tenantId: session.tenantId, name: session.tenantName, role: session.tenantRole, current: true }]).map((c) => (
            <li key={c.tenantId}>
              <button
                type="button"
                disabled={c.current || busy}
                className={`w-full rounded-lg px-2.5 py-2 text-left transition ${c.current ? "bg-brand-50 text-brand-800 ring-1 ring-brand-200/80" : "hover:bg-slate-50"}`}
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
    ...(session.sakuraWebEnabled
      ? [{ to: "/sakura-web", label: "Sakura Web", match: route[0] === "sakura-web", icon: <Sparkles className="h-4 w-4 shrink-0" /> }]
      : []),
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

  const navLinkClass = (on: boolean) =>
    `group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium transition-all duration-200 ${
      on
        ? "bg-white/12 text-white shadow-sm ring-1 ring-white/10"
        : "text-slate-300/90 hover:bg-white/8 hover:text-white"
    }`;

  const navIconClass = (on: boolean) =>
    `flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
      on ? "bg-brand-500/35 text-white" : "bg-white/5 text-slate-400 group-hover:bg-white/10 group-hover:text-white"
    }`;

  const NavGroup = ({ title, items }: { title: string; items: NavItem[] }) =>
    items.length ? (
      <div className="space-y-0.5">
        <p className="px-2 pt-2 pb-0.5 text-[10px] font-medium tracking-wide text-slate-500 uppercase first:pt-1">{title}</p>
        {items.map((n) => (
          <Link key={n.to} to={n.to} className={navLinkClass(n.match)} onClick={() => setMobileOpen(false)} aria-current={n.match ? "page" : undefined}>
            <span className={navIconClass(n.match)}>{n.icon}</span>
            <span className="truncate">{n.label}</span>
          </Link>
        ))}
      </div>
    ) : null;

  const specialty = profile?.specialty_code?.replace(/_/g, " ") ?? session.tenantRole;
  const doctorLabel = profile?.name_en ?? session.name;
  const doctorInitials = doctorLabel
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const sidebarSurface =
    "flex flex-col bg-gradient-to-b from-[#0d4a44] via-[#0a3d39] to-[#062a27] shadow-xl shadow-black/15 ring-1 ring-white/5";

  const sidebar = (
    <>
      <div className="border-b border-white/10 px-2.5 py-2">
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white shadow-md shadow-black/25"
            aria-hidden
          >
            Rx
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold tracking-tight text-white">RxPad</span>
              <span className="shrink-0 rounded-full bg-sakura-500/25 px-1.5 py-px text-[9px] font-semibold tracking-wide text-sakura-100 uppercase ring-1 ring-sakura-400/30">
                Clinic
              </span>
            </div>
            <p className="truncate text-[10px] text-slate-400">Prescription workspace</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-1.5 pb-1.5" aria-label="Main">
        <NavGroup title="Home" items={home} />
        <NavGroup title="Clinical" items={clinical} />
        <NavGroup title="Practice" items={practice} />
        <div className="mt-0.5 space-y-0.5 border-t border-white/10 pt-1.5">
          <p className="px-2 pb-0.5 text-[10px] font-medium tracking-wide text-slate-500 uppercase">Tools</p>
          <a
            href="#/display"
            className={navLinkClass(route[0] === "display")}
            onClick={() => setMobileOpen(false)}
            aria-current={route[0] === "display" ? "page" : undefined}
          >
            <span className={navIconClass(route[0] === "display")}>
              <Monitor className="h-4 w-4 shrink-0" />
            </span>
            <span className="truncate">Display</span>
          </a>
        </div>
      </nav>
      <div className="border-t border-white/10 p-2">
        <div className="rounded-lg bg-black/20 p-2 ring-1 ring-white/10">
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400/30 to-brand-700/40 text-[10px] font-semibold text-white ring-1 ring-white/15"
              aria-hidden
            >
              {doctorInitials || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-white" title={doctorLabel}>{doctorLabel}</p>
              <p className="truncate text-[10px] capitalize text-slate-400">{specialty}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={signingOut}
            onClick={() => void signOut()}
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
            data-form-type="other"
            data-testid="sign-out"
            className="relative z-0 mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] font-medium text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50 [&::-webkit-credentials-auto-fill-button]:hidden [&::-webkit-contacts-auto-fill-button]:hidden"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="h-dvh overflow-hidden bg-slate-100">
      <aside className={`fixed inset-y-0 left-0 z-40 w-52 ${sidebarSurface} print:hidden ${sidebarOpen ? "hidden md:flex" : "hidden"}`}>
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 print:hidden md:hidden">
          <button type="button" className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
          <aside className={`absolute inset-y-0 left-0 w-[min(13rem,88vw)] ${sidebarSurface}`}>
            <button type="button" className="absolute top-2.5 right-2.5 rounded p-1 text-slate-300 hover:bg-white/10" aria-label="Close" onClick={() => setMobileOpen(false)}>
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className={`flex h-dvh flex-col ${sidebarOpen ? "md:pl-52" : ""}`}>
        <header className="z-30 shrink-0 border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur-md print:hidden">
          <div className="flex h-11 items-center gap-1.5 px-2 sm:gap-2 sm:px-2.5">
            <button
              type="button"
              className="shrink-0 rounded-lg border border-slate-200/80 bg-white p-1.5 text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
              aria-label="Menu"
              data-testid="drawer-menu"
              onClick={() => {
                if (window.matchMedia("(min-width: 768px)").matches) setSidebarOpen((open) => !open);
                else setMobileOpen(true);
              }}
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="hidden min-w-0 max-w-[11rem] shrink-0 sm:block md:max-w-[13rem]">
              <ChamberSwitcher />
            </div>
            <HeaderSearch />
            <button
              type="button"
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-2.5 text-[11px] font-semibold whitespace-nowrap text-white shadow-sm shadow-brand-600/20 transition hover:bg-brand-700"
              data-testid="new-appointment"
              onClick={() => setNewPatientOpen(true)}
            >
              <CalendarPlus className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
              <span className="hidden sm:inline">New appointment</span>
              <span className="sm:hidden">New</span>
            </button>
            <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
              <div
                className="hidden h-8 items-center gap-0.5 rounded-lg border border-slate-200/80 bg-slate-50/60 p-0.5 text-[10px] font-semibold shadow-sm sm:flex"
                data-testid="queue-status"
              >
                <span className="flex h-full items-center gap-0.5 rounded-md bg-amber-100/90 px-1.5 text-amber-950 tabular-nums" title="Waiting">
                  <UsersRound className="h-3 w-3 opacity-70" aria-hidden />
                  {qs.waiting}
                  <span className="hidden font-medium lg:inline">waiting</span>
                </span>
                <span className="flex h-full items-center gap-0.5 rounded-md bg-blue-100/90 px-1.5 text-blue-950 tabular-nums" title="In room">
                  <UserCheck className="h-3 w-3 opacity-70" aria-hidden />
                  {qs.active}
                  <span className="hidden font-medium lg:inline">in room</span>
                </span>
                <span className="flex h-full items-center gap-0.5 rounded-md bg-emerald-100/90 px-1.5 text-emerald-950 tabular-nums" title="Seen">
                  <CheckCircle2 className="h-3 w-3 opacity-70" aria-hidden />
                  {qs.done}
                  <span className="hidden font-medium lg:inline">seen</span>
                </span>
              </div>
              <LiveClock />
              <RejectedNotice />
              <SyncBadge />
            </div>
          </div>
        </header>
        <PlanBanner />
        <main className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto p-2 sm:p-3 lg:h-0 lg:px-4 lg:py-3 xl:[&:has([data-visit-fill])]:overflow-hidden">
          <div className="flex flex-col lg:min-h-0 lg:flex-1 xl:[&:has([data-visit-fill])]:overflow-hidden">
            {children}
          </div>
        </main>
      </div>
      {newPatientOpen && <NewPatientModal open onClose={() => setNewPatientOpen(false)} />}
    </div>
  );
}
