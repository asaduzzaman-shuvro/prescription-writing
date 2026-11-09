/**
 * How long a chief complaint has lasted, written into its text: "Hearing loss - 3 days", "কানে কম শোনা - ৩ দিন".
 * C/C stays free text on the prescription; these helpers only add, replace or read the trailing duration.
 */

export type ComplaintDurationUnit = "day" | "week" | "month" | "year";

export const COMPLAINT_DURATION_UNITS: readonly ComplaintDurationUnit[] = ["day", "week", "month", "year"];

/** The quick picks offered after choosing a complaint. */
export const COMPLAINT_DURATION_PRESETS: readonly { n: number; unit: ComplaintDurationUnit }[] = [
  { n: 3, unit: "day" },
  { n: 5, unit: "day" },
  { n: 7, unit: "day" },
  { n: 2, unit: "week" },
  { n: 1, unit: "month" },
];

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const BN_UNIT: Record<ComplaintDurationUnit, string> = { day: "দিন", week: "সপ্তাহ", month: "মাস", year: "বছর" };

/** True when the line is written in Bangla, so its duration should be too. */
export function isBanglaText(text: string): boolean {
  return /[ঀ-৿]/.test(text);
}

/** "3 days" / "1 month", or "৩ দিন" in Bangla. */
export function formatComplaintDuration(n: number, unit: ComplaintDurationUnit, bangla = false): string {
  if (bangla) return `${String(n).replace(/\d/g, (d) => BN_DIGITS[Number(d)]!)} ${BN_UNIT[unit]}`;
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

// A trailing duration as doctors type it: "- 3 days", "× 3 days", "x 2 wk", "for 1 month", "7d", "৩ দিন".
const TRAILING =
  /\s*(?:[×x]|for|-|–)?\s*[0-9০-৯]+(?:\.[0-9০-৯]+)?\s*(?:days?|weeks?|wks?|months?|mo|years?|yrs?|d|w|m|y|দিন|সপ্তাহ|মাস|বছর)\s*$/iu;

/** The complaint without its trailing duration: "Hearing loss - 3 days" → "Hearing loss". */
export function stripComplaintDuration(text: string): string {
  const stripped = text.replace(TRAILING, "").trim();
  return stripped || text.trim();
}

/** The trailing duration as typed ("3 days"), or null when the line has none. */
export function complaintDuration(text: string): string | null {
  const m = TRAILING.exec(text);
  if (!m || !text.slice(0, m.index).trim()) return null;
  return m[0].replace(/^\s*(?:[×x]|for|-|–)?\s*/iu, "").trim();
}

/** Sets the line's duration, replacing any it had: ("Hearing loss", 3, "day") → "Hearing loss - 3 days". */
export function withComplaintDuration(text: string, n: number, unit: ComplaintDurationUnit): string {
  const base = stripComplaintDuration(text);
  if (!Number.isFinite(n) || n <= 0) return base;
  return `${base} - ${formatComplaintDuration(Math.round(n * 10) / 10, unit, isBanglaText(base))}`;
}
