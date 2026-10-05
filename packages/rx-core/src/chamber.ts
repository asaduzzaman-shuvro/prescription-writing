import { digits, type Numerals } from "./bangla";
import type { Lang } from "./dose";
import type { ChamberSlot, Weekday } from "./types";

/** Bangladeshi week order: Saturday first, Friday (weekend) last. */
export const WEEKDAYS: Weekday[] = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"];

const DAY_BN: Record<Weekday, string> = { sat: "শনি", sun: "রবি", mon: "সোম", tue: "মঙ্গল", wed: "বুধ", thu: "বৃহস্পতি", fri: "শুক্র" };
const DAY_EN: Record<Weekday, string> = { sat: "Sat", sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri" };

/** "শনি থেকে বুধবার", "রবিবার, মঙ্গলবার ও বৃহস্পতিবার", "প্রতিদিন" (or the English equivalents). */
export function formatDays(days: Weekday[], lang: Lang): string {
  const set = new Set(days);
  const sorted = WEEKDAYS.filter((d) => set.has(d));
  if (!sorted.length) return "";
  if (sorted.length === 7) return lang === "bn" ? "প্রতিদিন" : "Daily";
  const idx = sorted.map((d) => WEEKDAYS.indexOf(d));
  const consecutive = idx.every((v, i) => i === 0 || v === idx[i - 1]! + 1);
  if (consecutive && sorted.length >= 3) {
    const [a, b] = [sorted[0]!, sorted[sorted.length - 1]!];
    return lang === "bn" ? `${DAY_BN[a]} থেকে ${DAY_BN[b]}বার` : `${DAY_EN[a]}–${DAY_EN[b]}`;
  }
  const names = sorted.map((d) => (lang === "bn" ? `${DAY_BN[d]}বার` : DAY_EN[d]));
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} ${lang === "bn" ? "ও" : "&"} ${names[names.length - 1]}`;
}

function period(h: number): string {
  if (h >= 4 && h < 12) return "সকাল";
  if (h >= 12 && h < 15) return "দুপুর";
  if (h >= 15 && h < 18) return "বিকাল";
  if (h >= 18 && h < 20) return "সন্ধ্যা";
  return "রাত";
}

function parseTime(t: string | undefined): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? { h, m: min } : null;
}

/** "সকাল ৯টা", "বিকাল ৫.৩০টা", "9am", "5:30pm". */
export function formatTime(t: string, lang: Lang, numerals: Numerals): string {
  const p = parseTime(t);
  if (!p) return t;
  const h12 = p.h % 12 || 12;
  if (lang === "en") return `${h12}${p.m ? `:${String(p.m).padStart(2, "0")}` : ""}${p.h < 12 ? "am" : "pm"}`;
  return `${period(p.h)} ${digits(`${h12}${p.m ? `.${String(p.m).padStart(2, "0")}` : ""}`, numerals)}টা`;
}

/** "সকাল ৯টা - ১০টা" (period printed once when both ends share it), "বিকাল ৪টা - রাত ৮টা". */
export function formatTimeRange(from: string | undefined, to: string | undefined, lang: Lang, numerals: Numerals): string {
  const a = from ? formatTime(from, lang, numerals) : "";
  if (!to) return a;
  let b = formatTime(to, lang, numerals);
  const pa = parseTime(from);
  const pb = parseTime(to);
  if (lang === "bn" && pa && pb && period(pa.h) === period(pb.h)) b = b.replace(/^\S+ /, "");
  return a ? `${a} - ${b}` : b;
}

/** One schedule line, e.g. "রোগী দেখার সময়: শনি থেকে বুধবার, বিকাল ৫টা - রাত ৯টা". */
export function formatSlot(slot: ChamberSlot, lang: Lang, numerals: Numerals): string {
  const body = [formatDays(slot.days ?? [], lang), formatTimeRange(slot.from, slot.to, lang, numerals)].filter(Boolean).join(", ");
  const label = slot.label?.trim();
  return label ? (body ? `${label}: ${body}` : label) : body;
}

/** Default Bangladeshi working week: Saturday to Thursday (Friday off). */
export const BD_WORKDAYS: Weekday[] = ["sat", "sun", "mon", "tue", "wed", "thu"];

const JS_DAY: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Days the chamber is open, from its schedule slots that have times (operation-only slots don't count). */
export function chamberWorkdays(schedule: ChamberSlot[] | undefined): Weekday[] {
  const days = new Set((schedule ?? []).filter((s) => s.from || s.to).flatMap((s) => s.days));
  return days.size ? WEEKDAYS.filter((d) => days.has(d)) : BD_WORKDAYS;
}

/** Working days after `fromIso` up to and including `toIso` (0 when the same day or earlier). */
export function workingDaysBetween(fromIso: string, toIso: string, workdays: Weekday[] = BD_WORKDAYS): number {
  const set = new Set(workdays);
  const d = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${toIso.slice(0, 10)}T00:00:00Z`).getTime();
  let n = 0;
  for (let guard = 0; guard < 4000; guard++) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getTime() > end) break;
    if (set.has(JS_DAY[d.getUTCDay()]!)) n++;
  }
  return n;
}

/**
 * Whether today's visit falls inside the chamber's free report-showing window
 * ("পরামর্শের ৫ কর্মদিবসের মধ্যে রিপোর্ট দেখাতে ভিজিট লাগবে না").
 */
export function inFreeReportWindow(lastVisitIso: string | null | undefined, todayIso: string, freeDays: number | null | undefined, workdays?: Weekday[]): boolean {
  if (!lastVisitIso || !freeDays || freeDays <= 0 || lastVisitIso.slice(0, 10) >= todayIso.slice(0, 10)) return false;
  return workingDaysBetween(lastVisitIso, todayIso, workdays) <= freeDays;
}

/** The footer line for a free report-showing window. */
export function freeReportPolicyText(days: number, lang: Lang, numerals: Numerals): string {
  return lang === "bn"
    ? `পরামর্শের ${digits(days, numerals)} কর্মদিবসের মধ্যে রিপোর্ট দেখাতে সিরিয়াল বা ভিজিট লাগবে না।`
    : `Reports can be shown within ${days} working days of the consultation without a new fee.`;
}
