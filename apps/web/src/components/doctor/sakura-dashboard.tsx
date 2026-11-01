"use client";

import { usePowerSync } from "@powersync/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createPatient, startVisit, updatePatient, type VisitType } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import { useChambers, useDoctors } from "@/lib/doctor/hooks";
import { navigate } from "@/lib/doctor/router";
import { normaliseMobile, parseJson } from "@/lib/doctor/util";
import { sakuraApi, SakuraApiError } from "@/lib/sakura/client";
import type {
  SakuraAppointment,
  SakuraBreakStatus,
  SakuraChamber,
  SakuraChamberStats,
  SakuraTodayResponse,
} from "@/lib/sakura/types";
import {
  displayTypeLabel,
  formatAppointmentTime,
  formatSelectedDate,
  getAppointmentCaseType,
  getAutoPatientLabel,
  getDisplaySerial,
  isAbsentAppointment,
  isAutoBookedAppointment,
  isSeenListStatus,
  normalizeCaseIdentifier,
  pickNextPatientToCall,
  resolveDefaultChamberId,
  sortQueue,
  statsFromAppointments,
  statusLabel,
} from "@/lib/sakura/utils";
import { SakuraAppointmentModal } from "./sakura-appointment-modal";
import { SakuraCaseModal } from "./sakura-case-modal";
import { SakuraSubPatientModal } from "./sakura-sub-patient-modal";
import styles from "./sakura-dashboard.module.css";

type ListTab = "active" | "seen" | "absent" | "auto";
type CaseFilter = "OT Case" | "Research Case" | null;

/** External Sakura Angular doctor dashboard (opens in a new tab after auto-login handoff). */
const SAKURA_WEB_DASHBOARD_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SAKURA_WEB_URL?.replace(/\/$/, "")) ||
  "http://localhost:4200";

function openSakuraWebDashboard() {
  // Open synchronously so the browser does not treat the tab as a blocked popup.
  const popup = window.open("about:blank", "_blank");
  void (async () => {
    try {
      const handoff = await sakuraApi.externalHandoff();
      const payload = btoa(
        unescape(
          encodeURIComponent(
            JSON.stringify({
              token: handoff.token,
              refreshToken: handoff.refreshToken,
              user: handoff.user,
            }),
          ),
        ),
      );
      const base = (handoff.webBase || SAKURA_WEB_DASHBOARD_URL).replace(/\/$/, "");
      const url = `${base}/auth/rxpad-sso#${payload}`;
      if (popup) popup.location.href = url;
      else window.location.assign(url);
    } catch (err) {
      popup?.close();
      const message = err instanceof Error ? err.message : "Could not open Sakura dashboard";
      window.alert(message);
    }
  })();
}

/** Statuses doctors set from the queue; Cancel uses Delete, booking intermediates stay off this list. */
const STATUS_OPTIONS = ["scheduled", "running", "seen", "absent"] as const;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Approximate DOB from Sakura age (+ months) for RxPad patient create. */
function dobFromSakuraAge(age?: number | null, months?: number | null): string | null {
  const years = Number(age);
  if (!Number.isFinite(years) || years < 0) return null;
  const m = Number(months);
  const extraMonths = Number.isFinite(m) && m > 0 ? m : 0;
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setMonth(d.getMonth() - extraMonths);
  return d.toISOString().slice(0, 10);
}

function sexFromSakura(gender?: string | null): "male" | "female" | "other" | null {
  const g = (gender || "").toLowerCase();
  if (g === "male" || g === "female" || g === "other") return g;
  return null;
}

function visitTypeFromSakura(identifier?: string): VisitType | undefined {
  const id = normalizeCaseIdentifier(identifier);
  if (id === "Old") return "followup";
  if (id === "Lab Report") return "report";
  if (id === "New") return "new";
  return undefined;
}

function Ms({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} aria-hidden>
      {name}
    </span>
  );
}

function StatusDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; openUp: boolean } | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    if ((STATUS_OPTIONS as readonly string[]).includes(value)) return [...STATUS_OPTIONS];
    return [value, ...STATUS_OPTIONS];
  }, [value]);

  const stepStatus = useCallback(
    (dir: -1 | 1) => {
      const list = [...STATUS_OPTIONS];
      const idx = list.indexOf(value as (typeof STATUS_OPTIONS)[number]);
      const from = idx >= 0 ? idx : 0;
      const next = list[(from + dir + list.length) % list.length]!;
      if (next !== value) onChange(next);
    },
    [onChange, value],
  );

  const placeMenu = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menuH = Math.min(200, options.length * 28 + 8);
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < menuH && r.top > spaceBelow;
    setPos({
      top: openUp ? r.top - 1 : r.bottom + 1,
      left: r.left,
      width: Math.max(r.width, 7.5 * 16),
      openUp,
    });
  }, [options.length]);

  useEffect(() => {
    if (!open) return;
    placeMenu();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowUp") {
        e.preventDefault();
        stepStatus(-1);
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        stepStatus(1);
      }
    };
    const onReposition = () => placeMenu();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, placeMenu, stepStatus]);

  return (
    <>
      <div ref={rootRef} className={styles.statusDd}>
        <button
          ref={triggerRef}
          type="button"
          className={`${styles.statusDdTrigger} ${open ? styles.statusDdTriggerOpen : ""}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Appointment status"
          onClick={() => setOpen((o) => !o)}
        >
          <span className={styles.statusDdValue}>{statusLabel(value)}</span>
        </button>
        <div className={styles.statusDdSteppers}>
          <button
            type="button"
            className={styles.statusDdStepBtn}
            aria-label="Previous status"
            title="Previous status"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              stepStatus(-1);
            }}
          >
            <Ms name="keyboard_arrow_up" className={styles.statusDdStepIcon} />
          </button>
          <button
            type="button"
            className={styles.statusDdStepBtn}
            aria-label="Next status"
            title="Next status"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              stepStatus(1);
            }}
          >
            <Ms name="keyboard_arrow_down" className={styles.statusDdStepIcon} />
          </button>
        </div>
      </div>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            className={styles.statusDdMenu}
            role="listbox"
            style={{
              top: pos.openUp ? undefined : pos.top,
              bottom: pos.openUp ? window.innerHeight - pos.top : undefined,
              left: pos.left,
              minWidth: pos.width,
            }}
          >
            {options.map((s) => {
              const active = s === value;
              return (
                <button
                  key={s}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`${styles.statusDdOption} ${active ? styles.statusDdOptionActive : ""}`}
                  onClick={() => {
                    setOpen(false);
                    if (s !== value) onChange(s);
                  }}
                >
                  {statusLabel(s)}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

function useSakuraFonts() {
  useEffect(() => {
    const id = "sakura-dashboard-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap";
    document.head.appendChild(link);
  }, []);
}

function typeBadgeClass(identifier: string | undefined, css: typeof styles): string {
  const id = identifier || "New";
  if (id === "New") return css.badgeNew ?? "";
  if (id === "Old") return css.badgeOld ?? "";
  if (id === "Lab Report" || id === "Lab" || id === "Report") return css.badgeLab ?? "";
  if (id === "Emergency") return css.badgeEmergency ?? "";
  if (id === "OT Case" || id === "OT") return css.badgeOt ?? "";
  if (id === "Research Case" || id === "Research") return css.badgeResearch ?? "";
  return css.badgeDefault ?? "";
}

export function SakuraDashboard() {
  useSakuraFonts();

  const db = usePowerSync();
  const session = useSession();
  const doctors = useDoctors();
  const { current: chamber } = useChambers();
  const isDoctor = session.tenantRole === "doctor";

  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [rxBusyId, setRxBusyId] = useState<number | null>(null);
  /** When On: Next marks patient Running and opens their RxPad prescription automatically. */
  const [autoRxOnNext, setAutoRxOnNext] = useState(false);

  useEffect(() => {
    try {
      setAutoRxOnNext(localStorage.getItem("sakura_web_auto_rx_on_next") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  function setAutoRxPreference(enabled: boolean) {
    setAutoRxOnNext(enabled);
    try {
      localStorage.setItem("sakura_web_auto_rx_on_next", enabled ? "1" : "0");
    } catch {
      /* ignore */
    }
  }
  const [chambers, setChambers] = useState<SakuraChamber[]>([]);
  const [selectedChamberId, setSelectedChamberId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [appointments, setAppointments] = useState<SakuraAppointment[]>([]);
  const [stats, setStats] = useState<SakuraChamberStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patientListTab, setPatientListTab] = useState<ListTab>("active");
  const [patientCaseFilter, setPatientCaseFilter] = useState<CaseFilter>(null);
  const [showTestList, setShowTestList] = useState(false);
  const [patientsCompactView, setPatientsCompactView] = useState(false);
  const [activeBreak, setActiveBreak] = useState<SakuraBreakStatus | null>(null);
  const [breakModalOpen, setBreakModalOpen] = useState(false);
  const [breakNotes, setBreakNotes] = useState("");
  const [breakDuration, setBreakDuration] = useState(15);
  const [deleteTarget, setDeleteTarget] = useState<SakuraAppointment | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [subPatientParent, setSubPatientParent] = useState<SakuraAppointment | null>(null);
  const [caseModal, setCaseModal] = useState<{
    apt: SakuraAppointment;
    type: "OT Case" | "Research Case";
  } | null>(null);
  const [showNextIntro, setShowNextIntro] = useState(false);
  const [appointmentModal, setAppointmentModal] = useState<
    null | { mode: "create" } | { mode: "edit"; id: number }
  >(null);

  function openCaseModal(apt: SakuraAppointment, type: "OT Case" | "Research Case") {
    if (isAutoBookedAppointment(apt)) {
      window.alert("Edit name and phone first before setting a case.");
      return;
    }
    setCaseModal({ apt, type });
  }

  async function clearAppointmentCase(apt: SakuraAppointment) {
    const prev = normalizeCaseIdentifier(apt.identifier);
    const nextIdentifier =
      prev === "OT Case" || prev === "Research Case" ? "New" : apt.identifier || "New";
    try {
      const updated = await sakuraApi.put<SakuraAppointment>(`/appointments/${apt.id}`, {
        caseDetails: null,
        identifier: nextIdentifier,
      });
      setAppointments((list) =>
        list.map((a) =>
          a.id === apt.id
            ? {
                ...a,
                caseDetails: updated?.caseDetails ?? null,
                identifier: updated?.identifier ?? nextIdentifier,
              }
            : a,
        ),
      );
    } catch {
      window.alert("Could not clear case. Please try again.");
    }
  }

  const checkAuth = useCallback(async () => {
    try {
      const s = await sakuraApi.session();
      setAuthenticated(s.authenticated);
      setAuthError(s.authenticated ? null : s.error || "Could not connect to Sakura");
      if (s.warning) setError(s.warning);
    } catch (err) {
      setAuthenticated(false);
      setAuthError(err instanceof Error ? err.message : "Could not connect to Sakura");
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const applyDefaultChamber = useCallback((list: SakuraChamber[], date: string) => {
    if (!list.length) {
      setSelectedChamberId(null);
      return;
    }
    setSelectedChamberId(resolveDefaultChamberId(list, date));
  }, []);

  const loadChambers = useCallback(async () => {
    const list = await sakuraApi.get<SakuraChamber[]>("/chambers");
    const active = (Array.isArray(list) ? list : []).filter((c) => c.isActive !== false);
    setChambers(active);
    applyDefaultChamber(active, selectedDate);
    return active;
  }, [applyDefaultChamber, selectedDate]);

  const loadDashboard = useCallback(
    async (chamberId: number | null = selectedChamberId, date: string = selectedDate) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (chamberId) params.set("chamberId", String(chamberId));
        if (date) params.set("date", date);
        const qs = params.toString() ? `?${params}` : "";
        const response = await sakuraApi.get<SakuraTodayResponse | SakuraAppointment[]>(
          `/appointments/today${qs}`,
        );

        if (Array.isArray(response)) {
          setAppointments(response);
          setStats(statsFromAppointments(response));
        } else if (response?.appointments) {
          setAppointments(response.appointments);
          setStats({
            total: response.totalAppointments || 0,
            waiting: response.waitingAppointments || 0,
            running: response.runningAppointments || 0,
            seen: response.seenAppointments || 0,
            absent: response.absentAppointments || 0,
            report: response.reportAppointments || 0,
          });
        } else {
          setAppointments([]);
          setStats(statsFromAppointments([]));
        }

        const breakQs = chamberId ? `?chamberId=${chamberId}` : "";
        try {
          const br = await sakuraApi.get<SakuraBreakStatus>(`/breaks/status${breakQs}`);
          setActiveBreak(br?.isOnBreak ? br : null);
        } catch {
          setActiveBreak(null);
        }
      } catch (err) {
        if (err instanceof SakuraApiError && err.status === 401) setAuthenticated(false);
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    },
    [selectedChamberId, selectedDate],
  );

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await loadChambers();
        if (cancelled) return;
        const chamberId = resolveDefaultChamberId(list, selectedDate);
        setSelectedChamberId(chamberId);
        await loadDashboard(chamberId, selectedDate);
      } catch (err) {
        if (!cancelled) {
          if (err instanceof SakuraApiError && err.status === 401) setAuthenticated(false);
          setError(err instanceof Error ? err.message : "Failed to load chambers");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  const currentStats = stats ?? statsFromAppointments(appointments);

  const matchesCaseFilter = useCallback(
    (apt: SakuraAppointment) => {
      if (!patientCaseFilter) return true;
      const caseType = getAppointmentCaseType(apt);
      if (caseType) return caseType === patientCaseFilter;
      return normalizeCaseIdentifier(apt.identifier) === patientCaseFilter;
    },
    [patientCaseFilter],
  );

  const sorted = useMemo(() => sortQueue(appointments), [appointments]);
  const nextPreview = useMemo(() => pickNextPatientToCall(sorted), [sorted]);

  const waitingList = useMemo(
    () =>
      sorted
        .filter((a) => !isSeenListStatus(a.status))
        .filter((a) => !isAbsentAppointment(a))
        .filter((a) => !isAutoBookedAppointment(a))
        .filter(matchesCaseFilter),
    [sorted, matchesCaseFilter],
  );

  const seenList = useMemo(
    () =>
      sorted
        .filter((a) => isSeenListStatus(a.status))
        .filter((a) => !isAutoBookedAppointment(a))
        .filter(matchesCaseFilter)
        .sort((a, b) => (a.serialNumber || 0) - (b.serialNumber || 0)),
    [sorted, matchesCaseFilter],
  );

  const absentList = useMemo(
    () =>
      sorted
        .filter((a) => isAbsentAppointment(a))
        .filter((a) => !isAutoBookedAppointment(a))
        .filter(matchesCaseFilter),
    [sorted, matchesCaseFilter],
  );

  const autoList = useMemo(
    () => sorted.filter((a) => isAutoBookedAppointment(a)).filter(matchesCaseFilter),
    [sorted, matchesCaseFilter],
  );

  const activeList =
    patientListTab === "seen"
      ? seenList
      : patientListTab === "absent"
        ? absentList
        : patientListTab === "auto"
          ? autoList
          : waitingList;

  const testPatients = useMemo(
    () =>
      appointments
        .filter((a) => a.isPresent && a.status === "need_test" && !isAutoBookedAppointment(a))
        .sort((a, b) => (a.serialNumber || 0) - (b.serialNumber || 0)),
    [appointments],
  );

  function syncStatsLocal(next: SakuraAppointment[]) {
    setStats(statsFromAppointments(next));
  }

  async function togglePresent(appointmentId: number) {
    try {
      const updated = await sakuraApi.put<SakuraAppointment>(
        `/appointments/${appointmentId}/toggle-present`,
        {},
      );
      setAppointments((prev) => {
        const next = prev.map((apt) => {
          if (apt.id !== appointmentId) return apt;
          let isPresent = updated?.isPresent !== undefined ? updated.isPresent : !apt.isPresent;
          let status = updated?.status ?? apt.status;
          if (!updated?.status) {
            if (!isPresent) status = "absent";
            else if (status === "absent" || status === "no_show") status = "serialized";
          }
          return { ...apt, isPresent, status };
        });
        syncStatsLocal(next);
        return next;
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update presence");
    }
  }

  async function changeStatus(appointmentId: number, newStatus: string) {
    const apt = appointments.find((a) => a.id === appointmentId);
    if (apt && isAutoBookedAppointment(apt) && (newStatus === "running" || newStatus === "next")) {
      alert("Auto patient placeholders cannot be called. Edit name and phone first.");
      return;
    }
    try {
      const updated = await sakuraApi.put<SakuraAppointment>(`/appointments/${appointmentId}/status`, {
        status: newStatus,
      });
      setAppointments((prev) => {
        const next = prev.map((row) => {
          if (row.id !== appointmentId) return row;
          const status = updated?.status ?? newStatus;
          let isPresent = row.isPresent;
          if (updated?.isPresent !== undefined) isPresent = updated.isPresent;
          else if (status === "absent" || status === "no_show") isPresent = false;
          else if (["scheduled", "confirmed", "serialized", "running", "next"].includes(status)) {
            isPresent = true;
          }
          return { ...row, status, isPresent };
        });
        syncStatsLocal(next);
        return next;
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      await sakuraApi.delete(`/appointments/${deleteTarget.id}`);
      setDeleteTarget(null);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel appointment");
      setDeleteTarget(null);
    } finally {
      setDeleteSubmitting(false);
    }
  }

  async function startBreak() {
    try {
      const response = await sakuraApi.post<SakuraBreakStatus>("/breaks/start", {
        notes: breakNotes,
        duration: breakDuration,
        chamberId: selectedChamberId || undefined,
      });
      setActiveBreak(response);
      setBreakModalOpen(false);
      setBreakNotes("");
      setBreakDuration(15);
      await loadDashboard();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to start break");
    }
  }

  async function cancelBreak() {
    if (!activeBreak) return;
    if (!confirm("Are you sure you want to cancel the current break?")) return;
    const params = selectedChamberId ? `?chamberId=${selectedChamberId}` : "";
    try {
      await sakuraApi.delete(`/breaks/end${params}`);
      setActiveBreak(null);
      await loadDashboard();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel break");
    }
  }

  async function callNextPatient(nextPatient: SakuraAppointment) {
    try {
      await sakuraApi.put(`/appointments/${nextPatient.id}/status`, { status: "running" });
      await loadDashboard();
      if (autoRxOnNext) {
        await openPrescription(nextPatient);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to call patient");
    }
  }

  function onNextPatient() {
    setError(null);
    if (!appointments.length) {
      setError("No patients in queue.");
      return;
    }
    const nextPatient = pickNextPatientToCall(appointments);
    if (!nextPatient) {
      setError("No waiting patients.");
      return;
    }
    if (
      typeof sessionStorage !== "undefined" &&
      !sessionStorage.getItem("sakura_doctor_dashboard_next_intro_ack")
    ) {
      setShowNextIntro(true);
      return;
    }
    void callNextPatient(nextPatient);
  }

  function onNextIntroContinue() {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("sakura_doctor_dashboard_next_intro_ack", "1");
    }
    setShowNextIntro(false);
    const nextPatient = pickNextPatientToCall(appointments);
    if (!nextPatient) {
      setError("No waiting patients.");
      return;
    }
    void callNextPatient(nextPatient);
  }

  async function onTestNext() {
    if (!appointments.length) {
      alert("No patients in queue!");
      return;
    }
    const runningPatient = appointments.find((a) => a.status === "running");
    if (!runningPatient) {
      const nextShow = !showTestList;
      setShowTestList(nextShow);
      if (nextShow && testPatients.length === 0) {
        alert("No patients waiting for tests!");
        setShowTestList(false);
      }
      return;
    }
    try {
      await sakuraApi.put(`/appointments/${runningPatient.id}/status`, { status: "need_test" });
      const adjusted = appointments.map((a) =>
        a.id === runningPatient.id ? { ...a, status: "need_test" } : a,
      );
      const nextPatient = pickNextPatientToCall(adjusted);
      if (nextPatient) {
        await sakuraApi.put(`/appointments/${nextPatient.id}/status`, { status: "running" });
        alert(
          `Patient sent to test: ${runningPatient.patient.fullName}\n\nNext patient called: ${nextPatient.patient.fullName}`,
        );
      } else {
        alert(`Patient sent to test: ${runningPatient.patient.fullName}\n\nNo more patients waiting.`);
      }
      setShowTestList(true);
      await loadDashboard();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send patient to test");
    }
  }

  function onLabReportToolbar() {
    setPatientCaseFilter(null);
    if (!showTestList && testPatients.length === 0) {
      alert("No patients waiting for tests!");
      return;
    }
    setShowTestList((v) => !v);
  }

  async function assignTestSerial(appointment: SakuraAppointment) {
    if (
      !confirm(
        `Call patient for lab test?\n\nSerial #${getDisplaySerial(appointment, sorted)}\n${appointment.patient.fullName}`,
      )
    ) {
      return;
    }
    try {
      await sakuraApi.put(`/appointments/${appointment.id}/status`, { status: "next" });
      alert(
        `Patient ${appointment.patient.fullName} called for lab test.\n\nPatient will appear in main list with "Lab Test" type.`,
      );
      await loadDashboard();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to call patient for test");
    }
  }

  function onRefreshDashboard() {
    setPatientCaseFilter(null);
    setShowTestList(false);
    applyDefaultChamber(chambers, selectedDate);
    const chamberId = resolveDefaultChamberId(chambers, selectedDate);
    setSelectedChamberId(chamberId);
    void loadDashboard(chamberId, selectedDate);
  }

  /**
   * Open RxPad visit for this Sakura row only.
   * Match by Sakura patient/appt id, or exact name+phone — then sync name & details from Sakura.
   */
  async function openPrescription(apt: SakuraAppointment) {
    if (rxBusyId != null) return;
    if (isAutoBookedAppointment(apt)) {
      alert("Auto patient placeholders need a real name and phone first. Edit the appointment, then try Prescription.");
      return;
    }
    const name = (apt.patient?.fullName || "").trim();
    const mobile = normaliseMobile(apt.patient?.phone || "");
    const sakuraPatientId = (apt.patient?.patientId || "").trim();
    if (!name) {
      alert("Patient name is missing.");
      return;
    }
    const doctorId = isDoctor ? session.userId : doctors[0]?.id;
    if (!doctorId) {
      alert("No doctor in this chamber yet.");
      return;
    }

    const addressParts = [apt.patient.district, apt.patient.upazila, apt.patient.unionName, apt.patient.address]
      .map((x) => (x || "").trim())
      .filter(Boolean);
    const sakuraNote = [
      sakuraPatientId ? `Sakura ID: ${sakuraPatientId}` : "",
      `Sakura appt: ${apt.id}`,
    ]
      .filter(Boolean)
      .join(" · ");

    setRxBusyId(apt.id);
    try {
      let patientId: string | null = null;

      if (sakuraPatientId) {
        const bySakura = await db.getOptional<{ id: string }>(
          `SELECT id FROM patient WHERE deleted_at IS NULL AND notes LIKE ? LIMIT 1`,
          [`%Sakura ID: ${sakuraPatientId}%`],
        );
        if (bySakura) patientId = bySakura.id;
      }

      if (!patientId) {
        const byAppt = await db.getOptional<{ id: string }>(
          `SELECT id FROM patient WHERE deleted_at IS NULL AND notes LIKE ? LIMIT 1`,
          [`%Sakura appt: ${apt.id}%`],
        );
        if (byAppt) patientId = byAppt.id;
      }

      if (!patientId && mobile) {
        const exact = await db.getOptional<{ id: string }>(
          `SELECT id FROM patient WHERE mobile = ? AND lower(trim(name)) = lower(?) AND deleted_at IS NULL LIMIT 1`,
          [mobile, name],
        );
        if (exact) patientId = exact.id;
      }

      if (!patientId && !mobile) {
        const byName = await db.getOptional<{ id: string }>(
          `SELECT id FROM patient WHERE lower(trim(name)) = lower(?) AND (mobile IS NULL OR mobile = '') AND deleted_at IS NULL LIMIT 1`,
          [name],
        );
        if (byName) patientId = byName.id;
      }

      if (!patientId) {
        patientId = await createPatient(db, session.userId, session.tenantId, {
          name,
          dob: dobFromSakuraAge(apt.patient.age, apt.patient.months),
          dobEstimated: true,
          sex: sexFromSakura(apt.patient.gender),
          mobile,
          address: addressParts.join(", "),
          allergies: [],
          pregnancyStatus: null,
          guardianName: "",
          referredBy: "",
          nid: "",
          brn: "",
          healthId: "",
          notes: sakuraNote,
          consent: true,
          birthWeightKg: null,
          gestationalAgeWeeks: null,
        });
      } else {
        // Keep allergies / pregnancy / IDs from RxPad; refresh identity fields from Sakura.
        const existing = await db.getOptional<{
          allergies: string | null;
          pregnancy_status: string | null;
          guardian_name: string | null;
          referred_by: string | null;
          nid: string | null;
          brn: string | null;
          health_id: string | null;
          notes: string | null;
          consent_at: string | null;
          birth_weight_kg: number | null;
          gestational_age_weeks: number | null;
          dob: string | null;
          dob_estimated: number | null;
        }>(
          `SELECT allergies, pregnancy_status, guardian_name, referred_by, nid, brn, health_id, notes, consent_at,
                  birth_weight_kg, gestational_age_weeks, dob, dob_estimated
             FROM patient WHERE id = ?`,
          [patientId],
        );
        const dobFromSakura = dobFromSakuraAge(apt.patient.age, apt.patient.months);
        const mergedNotes = (() => {
          const prev = (existing?.notes || "").trim();
          if (!sakuraNote) return prev;
          if (!prev) return sakuraNote;
          if (prev.includes(sakuraNote) || (sakuraPatientId && prev.includes(`Sakura ID: ${sakuraPatientId}`))) {
            return prev.includes(`Sakura appt: ${apt.id}`)
              ? prev
              : `${prev.replace(/\s*·\s*Sakura appt:\s*\d+/g, "").trim()} · Sakura appt: ${apt.id}`.replace(/^\s*·\s*/, "");
          }
          return `${prev} · ${sakuraNote}`;
        })();
        await updatePatient(db, patientId, {
          name,
          dob: dobFromSakura ?? existing?.dob ?? null,
          dobEstimated: dobFromSakura ? true : Boolean(existing?.dob_estimated),
          sex: sexFromSakura(apt.patient.gender) ?? null,
          mobile,
          address: addressParts.join(", ") || "",
          allergies: parseJson<string[]>(existing?.allergies, []),
          pregnancyStatus: (existing?.pregnancy_status as "none" | "pregnant" | "lactating" | "both" | null) ?? null,
          guardianName: existing?.guardian_name || "",
          referredBy: existing?.referred_by || "",
          nid: existing?.nid || "",
          brn: existing?.brn || "",
          healthId: existing?.health_id || "",
          notes: mergedNotes,
          consent: Boolean(existing?.consent_at),
          birthWeightKg: existing?.birth_weight_kg ?? null,
          gestationalAgeWeeks: existing?.gestational_age_weeks ?? null,
        });
      }

      const encounterId = await startVisit(db, {
        tenantId: session.tenantId,
        userId: session.userId,
        patientId,
        doctorUserId: doctorId,
        chamberId: chamber?.id ?? null,
        specialtyCode: doctors.find((d) => d.id === doctorId)?.specialty_code ?? "general",
        asDoctor: isDoctor,
        visitType: visitTypeFromSakura(apt.identifier),
      });
      navigate(`/visit/${encounterId}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not open prescription");
    } finally {
      setRxBusyId(null);
    }
  }

  if (!authChecked) {
    return (
      <div className={`${styles.root} flex items-center justify-center py-16 text-slate-500`}>
        <div className="inline-block h-10 w-10 animate-spin rounded-full border-b-2 border-[#325A46]" />
        <p className="ml-3 text-sm">Connecting to Sakura…</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className={`${styles.root} mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800`}>
        <h1 className="text-base font-semibold text-red-900">Sakura Web unavailable</h1>
        <p className="mt-2">{authError}</p>
        <button
          type="button"
          className="mt-4 rounded-lg bg-[#1a1512] px-4 py-2 text-sm font-semibold text-white"
          onClick={() => void checkAuth()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      className={`${styles.root} mx-auto flex max-w-7xl min-w-0 flex-col gap-3 px-0 ${patientsCompactView ? styles.compact : ""}`}
      data-testid="sakura-web-dashboard"
    >
      {!patientsCompactView && (
        <div className={styles.heroCard}>
          <div className={styles.heroNext}>
            <span className={styles.heroNextIcon}>
              <Ms name="calendar_month" className="text-[1.45rem]" />
            </span>
            <div className="min-w-0">
              <p className={styles.heroNextLabel}>Next Appointment</p>
              <p className={styles.heroNextTitle}>
                {nextPreview
                  ? `${formatSelectedDate(selectedDate)} · ${formatAppointmentTime(nextPreview)}`
                  : `${formatSelectedDate(selectedDate)} · No one waiting`}
              </p>
              <p className={styles.heroNextPatient}>
                <Ms name="person" className="text-base" />
                {nextPreview
                  ? `Patient: ${nextPreview.patient.fullName}`
                  : "Queue is empty"}
              </p>
            </div>
          </div>

          <div className={styles.heroCenter}>
            <div className={styles.heroCol}>
              <span className={styles.filterLabelSpacer}>.</span>
              <span className={styles.heroAvatar} title={session.name || "Doctor"}>
                <Ms name="stethoscope" className="text-[1.35rem]" />
              </span>
            </div>
            <div className={styles.heroCol}>
              <span className={styles.filterLabel}>Date</span>
              <div className={`${styles.filterField} ${styles.filterFieldDate}`}>
                <Ms name="calendar_today" className="text-lg text-[var(--sg-green)]" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    const date = e.target.value;
                    setSelectedDate(date);
                    const chamberId = resolveDefaultChamberId(chambers, date);
                    setSelectedChamberId(chamberId);
                    void loadDashboard(chamberId, date);
                  }}
                />
              </div>
            </div>
            <div className={styles.heroCol}>
              <span className={styles.filterLabel}>Chamber</span>
              <div className={`${styles.filterField} ${styles.filterFieldSelect}`}>
                <Ms name="apartment" className="text-lg text-[var(--sg-green)]" />
                <select
                  className={styles.filterSelect}
                  value={selectedChamberId ?? ""}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : null;
                    setSelectedChamberId(id);
                    void loadDashboard(id, selectedDate);
                  }}
                >
                  <option value="">All Chambers</option>
                  {chambers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className={styles.heroActions}>
            <span className={styles.filterLabelSpacer}>.</span>
            <div className={styles.heroActionsRow}>
              <button
                type="button"
                onClick={openSakuraWebDashboard}
                className={styles.btnOpenDash}
                data-testid="sakura-web-external-dashboard"
                title="Open Sakura Web dashboard in a new tab (auto sign-in)"
              >
                <Ms name="open_in_new" className="text-lg" />
                <span>Open dashboard</span>
              </button>
              <button
                type="button"
                onClick={() => setAppointmentModal({ mode: "create" })}
                className={styles.btnAppointment}
                title="Book appointment"
              >
                <Ms name="add" className="text-lg" />
                <span>Appointment</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {activeBreak && !patientsCompactView && (
        <div className="flex items-center justify-between rounded-xl border-2 border-amber-400 bg-amber-50 p-4">
          <div className="flex items-center gap-3">
            <Ms name="schedule" className="text-2xl text-amber-600" />
            <div>
              <p className="font-semibold text-amber-800">On a break</p>
              {activeBreak.notes && <p className="text-sm text-amber-700">{activeBreak.notes}</p>}
              {activeBreak.duration != null && (
                <p className="text-xs text-amber-600">Duration: {activeBreak.duration} minutes</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void cancelBreak()}
            className="flex items-center gap-2 rounded-lg bg-[#1a1512] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <Ms name="close" className="text-lg" />
            <span>Cancel Break</span>
          </button>
        </div>
      )}

      {loading && (
        <div className="py-12 text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-b-2 border-[#325A46]" />
          <p className="mt-4 text-sm text-slate-600">Loading dashboard...</p>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {!loading && (
        <div className="space-y-3">
          <div className={styles.patientsCard}>
            <div className={styles.patientsCardHead}>
              <div className={styles.patientsTitleRow}>
                <span className={styles.patientsTitleIcon}>
                  <Ms name="groups" className="text-[1.25rem]" />
                </span>
                <div>
                  <h2 className={styles.patientsTitle}>Sakura Patients</h2>
                  <p className={styles.patientsSubtitle}>
                    Manage your chamber patients and appointments.
                  </p>
                </div>
              </div>
              <div className={styles.patientsHeadTools}>
                <div className={styles.callModeGroup} role="group" aria-label="Next call mode">
                  <button
                    type="button"
                    onClick={() => setAutoRxPreference(false)}
                    className={!autoRxOnNext ? styles.callModeLogoActive : styles.callModeLogo}
                    aria-pressed={!autoRxOnNext}
                    title="Call only"
                  >
                    <Ms name="call" className="text-[1.05rem]" />
                    <span>Call only</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoRxPreference(true)}
                    className={autoRxOnNext ? styles.callModeLogoActive : styles.callModeLogo}
                    aria-pressed={autoRxOnNext}
                    title="Call + Rx"
                  >
                    <Ms name="prescriptions" className="text-[1.05rem]" />
                    <span>Call + Rx</span>
                  </button>
                </div>
                <button type="button" onClick={onRefreshDashboard} className={styles.toolbarRefresh}>
                  <Ms name="refresh" className="text-lg" />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => setPatientsCompactView((v) => !v)}
                  className={`${styles.toolbarRefresh} lg:hidden`}
                  aria-pressed={patientsCompactView}
                >
                  <Ms name={patientsCompactView ? "fullscreen_exit" : "fullscreen"} className="text-lg" />
                  {patientsCompactView ? "Exit" : "Full"}
                </button>
                <select
                  className={`${styles.viewSelect} hidden lg:inline-block`}
                  value={patientsCompactView ? "compact" : "full"}
                  onChange={(e) => setPatientsCompactView(e.target.value === "compact")}
                  aria-label="View mode"
                >
                  <option value="full">View: Full</option>
                  <option value="compact">View: Compact</option>
                </select>
              </div>
            </div>

            <div className={styles.actionsToolbar}>
              <div className={styles.actionsToolbarButtons}>
                <div className={styles.controlButtons}>
                  <button type="button" onClick={onNextPatient} className={styles.btnNext}>
                    <Ms name="arrow_forward" className="text-base" />
                    <span>Next</span>
                  </button>
                  <button type="button" onClick={() => setBreakModalOpen(true)} className={styles.btnBreak}>
                    <Ms name="schedule" className="text-base" />
                    <span>Break</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPatientCaseFilter((f) => (f === "OT Case" ? null : "OT Case"))}
                    className={patientCaseFilter === "OT Case" ? styles.btnOtActive : styles.btnOt}
                  >
                    <Ms name="medical_services" className="text-base" />
                    <span>OT Case</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPatientCaseFilter((f) => (f === "Research Case" ? null : "Research Case"))
                    }
                    className={
                      patientCaseFilter === "Research Case" ? styles.btnResearchActive : styles.btnResearch
                    }
                  >
                    <Ms name="biotech" className="text-base" />
                    <span>Research Case</span>
                  </button>
                </div>
              </div>

              <div className={styles.actionsToolbarTabs}>
                {(
                  [
                    ["active", "Waiting", waitingList.length],
                    ["seen", "Seen", seenList.length],
                    ["absent", "Absent", absentList.length],
                    ["auto", "Empty slots", autoList.length],
                  ] as const
                ).map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPatientListTab(key)}
                    className={patientListTab === key ? styles.tabBtnActive : styles.tabBtn}
                  >
                    {label}
                    {appointments.length > 0 && (
                      <span className="ml-1 tabular-nums opacity-90">({count})</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {appointments.length === 0 ? (
              <div className="py-8 text-center">
                <Ms name="calendar_today" className="text-5xl text-slate-300" />
                <h3 className="mt-3 text-base font-bold text-slate-900">No appointments today</h3>
                <p className="mt-1 text-sm text-slate-500">Get started by booking a new appointment</p>
                <button
                  type="button"
                  onClick={() => setAppointmentModal({ mode: "create" })}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#1a1512] px-3 py-1.5 text-xs font-bold text-white shadow-md hover:opacity-90"
                >
                  <Ms name="add" className="text-base" />
                  Book Appointment
                </button>
              </div>
            ) : activeList.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Ms name="groups" className="text-4xl text-slate-300" />
                <p className="mt-2 text-sm font-semibold text-slate-800">
                  {patientListTab === "active" && "No patients in the queue"}
                  {patientListTab === "seen" && "No seen patients for this day"}
                  {patientListTab === "absent" && "No absent patients for this day"}
                  {patientListTab === "auto" && "No empty slots for this day"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {patientListTab === "active" &&
                    "Patients still in queue. After the visit, open Actions and choose Seen — they move to the Seen tab."}
                  {patientListTab === "seen" &&
                    "Patients you have already seen today. Use Actions if you need to send someone back to Waiting."}
                  {patientListTab === "absent" &&
                    "Did not come. Set Present to No on Waiting, or status to Absent. Change status here to put them back in queue."}
                  {patientListTab === "auto" &&
                    "Reserved serials with no name yet. Edit to add name and phone — they then appear on Waiting and on the TV."}
                </p>
              </div>
            ) : (
              <div
                className={styles.tableWrap}
                style={patientsCompactView ? { maxHeight: undefined } : undefined}
              >
                <table className="min-w-full divide-y divide-[var(--sg-line)]">
                  <thead className={`${styles.thead} sticky top-0 z-10`}>
                    <tr>
                      {[
                        "SL",
                        "P.Serial",
                        "Patient",
                        "Type",
                        "Time",
                        "Present",
                        "Case name",
                        "Status",
                        "Prescription",
                        "Action",
                      ].map((h) => (
                          <th
                            key={h}
                            className={`${styles.thCell}${h === "Status" ? ` ${styles.statusCol}` : ""}${
                              h === "Prescription" || h === "Action" ? ` ${styles.colRight}` : ""
                            }`}
                          >
                            {h}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--sg-line)] bg-white">
                    {activeList.map((apt) => (
                      <tr
                        key={apt.id}
                        className={`transition-colors hover:bg-[var(--sg-mint)] ${
                          apt.status === "running" ? styles.rowRunning : ""
                        }`}
                      >
                        <td className={`${styles.tableCell} whitespace-nowrap`}>
                          <div className="text-xs font-bold tabular-nums text-[var(--sg-ink)]">
                            {getDisplaySerial(apt, sorted)}
                          </div>
                        </td>
                        <td className={`${styles.tableCell} whitespace-nowrap`}>
                          <div className={styles.serialChip}>#{getDisplaySerial(apt, sorted)}</div>
                        </td>
                        <td className={`${styles.tableCell} whitespace-nowrap`}>
                          <div className="text-xs font-bold text-[var(--sg-ink)]">{apt.patient.fullName}</div>
                          <div className="text-xs text-[var(--sg-muted)]">{apt.patient.phone}</div>
                        </td>
                        <td className={`${styles.tableCell} whitespace-nowrap`}>
                          {patientListTab === "auto" ? (
                            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                              {getAutoPatientLabel(apt)}
                            </span>
                          ) : (
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeBadgeClass(apt.identifier, styles)}`}
                            >
                              {displayTypeLabel(apt.identifier)}
                            </span>
                          )}
                        </td>
                        <td className={`${styles.tableCell} whitespace-nowrap`}>
                          <div className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-[var(--sg-ink)]">
                            <Ms name="schedule" className="text-sm text-[var(--sg-green)]" />
                            {formatAppointmentTime(apt)}
                          </div>
                        </td>
                        <td className={`${styles.tableCell} whitespace-nowrap`}>
                          {patientListTab === "auto" ? (
                            <span className="text-xs font-semibold text-amber-800">Placeholder</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void togglePresent(apt.id)}
                              className={`inline-flex items-center gap-0.5 rounded-lg px-2.5 py-1 text-xs font-bold shadow-sm transition hover:opacity-85 ${
                                apt.isPresent ? styles.presentYes : styles.presentNo
                              }`}
                            >
                              <Ms
                                name={apt.isPresent ? "check" : "radio_button_unchecked"}
                                className="text-sm"
                              />
                              {apt.isPresent ? "Yes" : "No"}
                            </button>
                          )}
                        </td>
                        <td className={`${styles.tableCell} whitespace-nowrap`}>
                          {patientListTab === "auto" ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : (
                            <div className={styles.caseCell}>
                              <button
                                type="button"
                                title="OT case details"
                                className={`${styles.caseChip} ${styles.caseChipOt}${
                                  getAppointmentCaseType(apt) === "OT Case" ? ` ${styles.caseChipOn}` : ""
                                }`}
                                onClick={() => openCaseModal(apt, "OT Case")}
                              >
                                OT
                              </button>
                              <button
                                type="button"
                                title="Research case details"
                                className={`${styles.caseChip} ${styles.caseChipResearch}${
                                  getAppointmentCaseType(apt) === "Research Case"
                                    ? ` ${styles.caseChipOn}`
                                    : ""
                                }`}
                                onClick={() => openCaseModal(apt, "Research Case")}
                              >
                                Research
                              </button>
                              {getAppointmentCaseType(apt) && (
                                <button
                                  type="button"
                                  title="Clear case"
                                  className={styles.caseClear}
                                  onClick={() => void clearAppointmentCase(apt)}
                                >
                                  <Ms name="close" className="text-sm" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className={`${styles.tableCell} ${styles.statusCol} whitespace-nowrap`}>
                          {patientListTab !== "auto" ? (
                            <StatusDropdown
                              value={apt.status}
                              onChange={(next) => void changeStatus(apt.id, next)}
                            />
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className={`${styles.tableCell} ${styles.colRight} whitespace-nowrap`}>
                          {patientListTab === "auto" ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : (
                            <button
                              type="button"
                              title="Write prescription"
                              disabled={rxBusyId === apt.id}
                              onClick={() => void openPrescription(apt)}
                              className={styles.rxBtn}
                            >
                              <Ms
                                name={rxBusyId === apt.id ? "progress_activity" : "prescriptions"}
                                className={`text-base ${rxBusyId === apt.id ? "animate-spin" : ""}`}
                              />
                              {rxBusyId === apt.id ? "Opening…" : "Rx"}
                            </button>
                          )}
                        </td>
                        <td className={`${styles.tableCell} ${styles.colRight} whitespace-nowrap`}>
                          <div className={styles.rowTools}>
                            {patientListTab !== "auto" && (
                              <button
                                type="button"
                                title="Add patient under this serial"
                                className={styles.addBtn}
                                onClick={() => {
                                  if (isAutoBookedAppointment(apt)) {
                                    window.alert(
                                      "Edit the auto patient placeholder first, then add linked patients.",
                                    );
                                    return;
                                  }
                                  setSubPatientParent(apt);
                                }}
                              >
                                <Ms name="person_add" className="text-[1.05rem]" />
                              </button>
                            )}
                            <button
                              type="button"
                              title="Edit appointment"
                              className={styles.editBtn}
                              onClick={() => setAppointmentModal({ mode: "edit", id: apt.id })}
                            >
                              <Ms name="edit" className="text-[1.05rem]" />
                            </button>
                            <button
                              type="button"
                              title="Cancel appointment"
                              className={styles.deleteBtn}
                              onClick={() => setDeleteTarget(apt)}
                            >
                              <Ms name="delete" className="text-[1.05rem]" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {showTestList && (
            <div className="rounded-xl border border-[#e8e0d5] bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
                  <h2 className="text-base font-bold text-[#2c2825]">Patients sent for tests</h2>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-600">
                    <Ms name="science" className="text-sm text-[#9e7a3d]" />
                    Patients waiting for tests
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  onClick={() => setShowTestList(false)}
                >
                  <Ms name="close" className="text-xl" />
                </button>
              </div>
              <div className="overflow-x-auto" style={{ maxHeight: 300, overflowY: "auto" }}>
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className={`${styles.thead} sticky top-0 z-10`}>
                    <tr>
                      {["Serial", "Patient", "Test Type", "Action"].map((h) => (
                        <th
                          key={h}
                          className="px-3 py-1.5 text-left text-xs font-semibold tracking-wider text-[#2c2825] uppercase"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {testPatients.map((apt) => (
                      <tr
                        key={apt.id}
                        className="cursor-pointer transition-colors hover:bg-[rgba(201,151,63,0.05)]"
                        onClick={() => void assignTestSerial(apt)}
                      >
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <div className="text-sm font-bold text-[#2c2825]">
                            #{getDisplaySerial(apt, sorted)}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <div className="text-sm font-medium text-slate-900">{apt.patient.fullName}</div>
                          <div className="text-xs text-slate-500">{apt.patient.patientId}</div>
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styles.badgeNew}`}>
                            Lab Test
                          </span>
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void assignTestSerial(apt);
                            }}
                            className="flex items-center gap-1 rounded-lg bg-[#1a1512] px-3 py-1.5 text-xs font-bold text-white shadow-md transition-opacity hover:opacity-90"
                          >
                            <Ms name="campaign" className="text-base" />
                            Call for Test
                          </button>
                        </td>
                      </tr>
                    ))}
                    {testPatients.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">
                          No patients waiting for tests
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {breakModalOpen && (
        <div className={styles.modalBackdrop} onClick={() => setBreakModalOpen(false)}>
          <div
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[#e8e0d5] bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 bg-[#1a1512] px-5 py-4 text-white">
              <div className="flex items-center gap-2">
                <Ms name="schedule" className="text-2xl" />
                <h2 className="text-lg font-bold">Take a Break</h2>
              </div>
              <button
                type="button"
                className="rounded-lg p-1 text-white/90 hover:bg-white/10"
                onClick={() => setBreakModalOpen(false)}
              >
                <Ms name="close" className="text-xl" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[#2c2825]">Note on TV (patients will see this)</span>
                <textarea
                  className="w-full rounded-lg border border-[#e8e0d5] px-3 py-2 text-sm outline-none focus:border-[#c9973f] focus:ring-2 focus:ring-[#c9973f]/40"
                  rows={3}
                  value={breakNotes}
                  onChange={(e) => setBreakNotes(e.target.value)}
                  placeholder="e.g., Lunch break, Emergency call, etc."
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[#2c2825]">How long (minutes)</span>
                <input
                  type="number"
                  className="w-full rounded-lg border border-[#e8e0d5] px-3 py-2 text-sm outline-none focus:border-[#c9973f] focus:ring-2 focus:ring-[#c9973f]/40"
                  min={5}
                  max={120}
                  value={breakDuration}
                  onChange={(e) => setBreakDuration(Number(e.target.value) || 15)}
                />
              </label>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  className="flex-1 rounded-lg border border-[#e8e0d5] px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => setBreakModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-[#1a1512] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
                  onClick={() => void startBreak()}
                >
                  Start Break
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNextIntro && (
        <div className={styles.modalBackdrop} onClick={() => setShowNextIntro(false)} role="dialog">
          <div
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[#e8e0d5] bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 bg-[#1a1512] px-5 py-4">
              <div className="flex items-center gap-2 text-white">
                <Ms name="waving_hand" className="text-2xl" />
                <h2 className="text-lg leading-tight font-bold">Start seeing patients</h2>
              </div>
              <button
                type="button"
                className="rounded-lg p-1 text-white/90 hover:bg-white/10"
                onClick={() => setShowNextIntro(false)}
              >
                <Ms name="close" className="text-xl" />
              </button>
            </div>
            <div className="px-5 py-4 text-sm text-slate-700">
              <p>
                <strong className="text-[#2c2825]">Next</strong> calls the next waiting patient
                {autoRxOnNext ? " and opens their prescription." : "."}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 pt-4 pb-5">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setShowNextIntro(false)}
              >
                Not now
              </button>
              <button
                type="button"
                className="rounded-lg border border-[#e8e0d5] bg-[#c9973f] px-4 py-2 text-sm font-bold text-[#1a1512] shadow-sm hover:opacity-90"
                onClick={onNextIntroContinue}
              >
                Continue &amp; call next
              </button>
            </div>
          </div>
        </div>
      )}

      {appointmentModal && (
        <SakuraAppointmentModal
          mode={appointmentModal.mode}
          appointmentId={appointmentModal.mode === "edit" ? appointmentModal.id : null}
          defaultDate={selectedDate}
          defaultChamberId={selectedChamberId}
          onClose={() => setAppointmentModal(null)}
          onSaved={() => void loadDashboard()}
        />
      )}

      {subPatientParent && (
        <SakuraSubPatientModal
          parent={subPatientParent}
          allAppointments={appointments}
          chambers={chambers}
          onClose={() => setSubPatientParent(null)}
          onSaved={() => {
            setSubPatientParent(null);
            void loadDashboard();
          }}
        />
      )}

      {caseModal && (
        <SakuraCaseModal
          appointment={caseModal.apt}
          caseType={caseModal.type}
          allAppointments={appointments}
          onClose={() => setCaseModal(null)}
          onSaved={(patch) => {
            setAppointments((list) =>
              list.map((a) => (a.id === caseModal.apt.id ? { ...a, ...patch } : a)),
            );
            setCaseModal(null);
          }}
        />
      )}

      {deleteTarget && (
        <div
          className={styles.modalBackdrop}
          style={{ zIndex: 101 }}
          onClick={() => !deleteSubmitting && setDeleteTarget(null)}
          role="dialog"
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-red-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 bg-red-600 px-5 py-4 text-white">
              <Ms name="delete_forever" className="shrink-0 text-3xl" />
              <div className="min-w-0">
                <h2 className="text-lg leading-tight font-bold">Cancel appointment?</h2>
                <p className="mt-2 text-sm leading-snug opacity-95">
                  This will remove{" "}
                  <strong className="font-semibold text-white">{deleteTarget.patient.fullName}</strong> (Serial #
                  {getDisplaySerial(deleteTarget, sorted)}) from the queue. You can still see them in history if
                  needed.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <button
                type="button"
                disabled={deleteSubmitting}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white disabled:opacity-50"
                onClick={() => setDeleteTarget(null)}
              >
                Keep appointment
              </button>
              <button
                type="button"
                disabled={deleteSubmitting}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                onClick={() => void confirmDelete()}
              >
                {deleteSubmitting && (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                )}
                {deleteSubmitting ? "Cancelling…" : "Yes, cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
