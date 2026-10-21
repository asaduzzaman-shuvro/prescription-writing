import type { SakuraAppointment, SakuraChamber, SakuraChamberStats } from "./types";

const CHAMBER_WEEKDAY_ORDER = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function isAutoBookedAppointment(apt: SakuraAppointment): boolean {
  if (apt.isAutoBooked === true) return true;
  const name = (apt.patient?.fullName || "").trim();
  if (!name) return false;
  return /^(Auto Patient|Doctor Booked|Clinic Booked)\s+\d+$/i.test(name);
}

export function getAutoPatientLabel(apt: SakuraAppointment): string {
  if (apt.autoBookCategory === "doctor") return "Doctor Booked";
  if (apt.autoBookCategory === "clinic") return "Clinic Booked";
  return "Auto Patient";
}

function timeStringToMinutes(time: string | null | undefined): number | null {
  if (time == null || time === "") return null;
  let s = String(time).trim();
  if (s.length >= 5) s = s.slice(0, 5);
  const parts = s.split(":");
  if (parts.length < 2) return null;
  const hours = parseInt(parts[0]!, 10);
  const minutes = parseInt(parts[1]!, 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function getWeekdayNameForDate(dateStr: string): (typeof CHAMBER_WEEKDAY_ORDER)[number] | null {
  if (!dateStr) return null;
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  const date = new Date(y!, m! - 1, d!);
  if (Number.isNaN(date.getTime())) return null;
  return CHAMBER_WEEKDAY_ORDER[date.getDay()]!;
}

function isChamberAvailableOnDate(chamber: SakuraChamber, dateStr: string): boolean {
  const weekday = getWeekdayNameForDate(dateStr);
  if (!weekday) return false;
  const days = chamber.availableDays;
  if (!Array.isArray(days) || days.length === 0) return false;
  return days.some((d) => String(d).trim().toLowerCase() === weekday.toLowerCase());
}

function sameCalendarDay(a: Date, dateStr: string): boolean {
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3) return false;
  const local = new Date(parts[0]!, parts[1]! - 1, parts[2]!);
  return (
    a.getFullYear() === local.getFullYear() &&
    a.getMonth() === local.getMonth() &&
    a.getDate() === local.getDate()
  );
}

export function resolveDefaultChamberId(
  chambers: SakuraChamber[],
  dateStr: string,
  now: Date = new Date(),
): number | null {
  const active = chambers.filter((c) => c.isActive !== false);
  const forDay = active.filter((c) => isChamberAvailableOnDate(c, dateStr));
  if (forDay.length === 0) return null;
  if (forDay.length === 1) return forDay[0]!.id;

  const withTimes = forDay
    .map((c) => ({
      chamber: c,
      open: timeStringToMinutes(c.openingTime),
      close: timeStringToMinutes(c.closingTime),
    }))
    .filter((x) => x.open != null && x.close != null) as Array<{
    chamber: SakuraChamber;
    open: number;
    close: number;
  }>;

  if (withTimes.length === 0) return forDay[0]!.id;

  withTimes.sort((a, b) => a.open - b.open || a.close - b.close);

  let refMinutes: number;
  if (sameCalendarDay(now, dateStr)) {
    refMinutes = now.getHours() * 60 + now.getMinutes();
  } else {
    const parts = dateStr.split("-").map(Number);
    const selected = new Date(parts[0]!, parts[1]! - 1, parts[2]!);
    selected.setHours(0, 0, 0, 0);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    refMinutes = selected.getTime() > today.getTime() ? 0 : 24 * 60 - 1;
  }

  const inSession = withTimes.filter((x) => refMinutes >= x.open && refMinutes <= x.close);
  if (inSession.length >= 1) return inSession[0]!.chamber.id;

  const beforeFirst = withTimes.every((x) => refMinutes < x.open);
  if (beforeFirst) return withTimes[0]!.chamber.id;

  const afterAll = withTimes.every((x) => refMinutes > x.close);
  if (afterAll) return withTimes[withTimes.length - 1]!.chamber.id;

  const upcoming = withTimes.filter((x) => x.open > refMinutes).sort((a, b) => a.open - b.open);
  if (upcoming.length > 0) return upcoming[0]!.chamber.id;

  const latestPast = withTimes.filter((x) => x.close < refMinutes).sort((a, b) => b.close - a.close);
  if (latestPast.length > 0) return latestPast[0]!.chamber.id;

  return withTimes[0]!.chamber.id;
}

export function formatAppointmentTime(apt: SakuraAppointment): string {
  const raw = apt.appointmentTime?.trim() || apt.appointmentSlot?.startTime?.trim();
  if (!raw) return "—";
  const parts = raw.split(":");
  if (parts.length < 2) return raw;
  const hours = parseInt(parts[0]!, 10);
  const minutes = parts[1]!;
  if (Number.isNaN(hours)) return raw;
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${displayHour}:${minutes} ${period}`;
}

export function formatSelectedDate(dateString: string): string {
  if (!dateString) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const inputDate = new Date(dateString);
  inputDate.setHours(0, 0, 0, 0);
  if (inputDate.getTime() === today.getTime()) return "Today";
  if (inputDate.getTime() === tomorrow.getTime()) return "Tomorrow";
  if (inputDate.getTime() === yesterday.getTime()) return "Yesterday";
  return inputDate.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    scheduled: "Scheduled",
    confirmed: "Confirmed",
    serialized: "Serialized",
    running: "Running",
    seen: "Seen",
    completed: "Completed",
    absent: "Absent",
    next: "Next",
    call_from_dr: "Called",
    need_test: "Need Test",
    cancelled: "Cancelled",
    no_show: "No Show",
  };
  return labels[status] || status;
}

export function normalizeCaseIdentifier(raw: string | undefined | null): string {
  if (!raw) return "New";
  const t = String(raw).trim();
  if (t === "OT" || t === "OT Case") return "OT Case";
  if (t === "Research" || t === "Research Case") return "Research Case";
  return t;
}

export function isSeenListStatus(status: string): boolean {
  return status === "seen" || status === "completed";
}

export function isAbsentAppointment(apt: SakuraAppointment): boolean {
  return apt.status === "absent" || apt.status === "no_show" || !apt.isPresent;
}

export function pickNextPatientToCall(appointments: SakuraAppointment[]): SakuraAppointment | null {
  const present = appointments.filter((a) => a.isPresent && !isAutoBookedAppointment(a));
  const designated = present.find((a) => a.status === "next");
  if (designated) return designated;

  const running = present.find((a) => a.status === "running");
  const waiting = present
    .filter((a) => ["scheduled", "confirmed", "serialized", "next"].includes(a.status))
    .sort((a, b) => (a.serialNumber || 0) - (b.serialNumber || 0));

  if (waiting.length === 0) return null;
  if (running) {
    const rs = running.serialNumber || 0;
    return waiting.find((a) => (a.serialNumber || 0) > rs) ?? waiting[0]!;
  }
  return waiting[0]!;
}

export function sortQueue(appointments: SakuraAppointment[]): SakuraAppointment[] {
  const timeToMinutes = (timeStr: string | null | undefined): number => {
    if (!timeStr) return Infinity;
    let normalizedTime = timeStr.trim();
    if (normalizedTime.length === 5) normalizedTime = `${normalizedTime}:00`;
    const parts = normalizedTime.split(":");
    if (parts.length < 2) return Infinity;
    const hours = parseInt(parts[0]!, 10);
    const minutes = parseInt(parts[1]!, 10);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return Infinity;
    return hours * 60 + minutes;
  };

  const queueRank = (s: string): number => {
    if (s === "running") return 0;
    if (s === "next") return 1;
    return 2;
  };

  return [...appointments].sort((a, b) => {
    const ra = queueRank(a.status);
    const rb = queueRank(b.status);
    if (ra !== rb) return ra - rb;
    const sd = (a.serialNumber || 0) - (b.serialNumber || 0);
    if (sd !== 0) return sd;
    const timeA = a.appointmentTime?.trim() || a.appointmentSlot?.startTime?.trim();
    const timeB = b.appointmentTime?.trim() || b.appointmentSlot?.startTime?.trim();
    return timeToMinutes(timeA) - timeToMinutes(timeB);
  });
}

export function statsFromAppointments(appointments: SakuraAppointment[]): SakuraChamberStats {
  const queue = appointments.filter((a) => !isAutoBookedAppointment(a));
  return {
    total: appointments.length,
    waiting: queue.filter((a) => ["scheduled", "confirmed", "serialized"].includes(a.status)).length,
    running: queue.filter((a) => a.status === "running").length,
    seen: queue.filter((a) => ["seen", "completed"].includes(a.status)).length,
    absent: queue.filter((a) => isAbsentAppointment(a)).length,
    report: queue.filter((a) => a.status === "need_test").length,
  };
}

export function typeBadgeClass(identifier: string | undefined): string {
  const id = identifier || "New";
  if (id === "New") return "bg-emerald-100 text-emerald-900";
  if (id === "Old") return "bg-teal-100 text-teal-900";
  if (id === "Lab Report" || id === "Lab" || id === "Report") return "bg-amber-100 text-amber-900";
  if (id === "Emergency") return "bg-red-100 text-red-800";
  if (id === "OT Case" || id === "OT") return "bg-slate-600/15 text-slate-800";
  if (id === "Research Case" || id === "Research") return "bg-indigo-100 text-indigo-900";
  return "bg-slate-100 text-slate-700";
}

export function displayTypeLabel(identifier: string | undefined): string {
  if (identifier === "Lab" || identifier === "Report") return "Lab Report";
  return identifier || "New";
}
