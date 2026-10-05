import { digits, type Numerals } from "./bangla";
import type { DurationUnit, PrescriptionDoc } from "./types";

/** Age split into calendar years, months and days, measured at `at`. */
export function ageParts(dob: string | null | undefined, at = new Date()): { years: number; months: number; days: number } | null {
  if (!dob) return null;
  const b = new Date(`${dob.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(b.getTime())) return null;
  let years = at.getFullYear() - b.getFullYear();
  let months = at.getMonth() - b.getMonth();
  let days = at.getDate() - b.getDate();
  if (days < 0) {
    months--;
    days += new Date(at.getFullYear(), at.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  return { years, months, days };
}

/**
 * Age fields for the printed patient strip, measured on the prescription date:
 * months only under 5 years, days only under 1 month.
 */
export function printAge(
  dob: string | null | undefined,
  atIso: string,
): { ageYears?: number; ageMonths?: number; ageDays?: number } {
  const a = ageParts(dob, new Date(`${atIso.slice(0, 10)}T00:00:00`));
  if (!a) return {};
  return {
    ageYears: a.years || undefined,
    ageMonths: a.years < 5 ? a.months || undefined : undefined,
    ageDays: a.years === 0 && a.months === 0 ? a.days : undefined,
  };
}

/**
 * Calendar date (yyyy-mm-dd) `value` units after `fromIso`. Month steps clamp to the
 * last day of the target month, so 31 Jan + 1 month is 28/29 Feb, not 3 Mar.
 */
export function addDuration(fromIso: string, value: number, unit: DurationUnit): string {
  const d = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
  if (unit === "day") d.setUTCDate(d.getUTCDate() + value);
  if (unit === "week") d.setUTCDate(d.getUTCDate() + 7 * value);
  if (unit === "month") {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + value);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  }
  return d.toISOString().slice(0, 10);
}

/** The follow-up due date (yyyy-mm-dd) for a prescription written on `fromIso`, or null. */
export function followUpDate(followUp: PrescriptionDoc["followUp"], fromIso: string): string | null {
  if (!followUp || followUp.kind === "none") return null;
  if (followUp.kind === "date") return followUp.date.slice(0, 10);
  return addDuration(fromIso, followUp.value, followUp.unit);
}

/** yyyy-mm-dd → dd{sep}mm{sep}yyyy, e.g. "11-07-2026" or "১১-০৭-২০২৬". */
export function formatDateDmy(iso: string, numerals: Numerals, sep = "-"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return digits(iso, numerals);
  return digits(`${m[3]}${sep}${m[2]}${sep}${m[1]}`, numerals);
}
