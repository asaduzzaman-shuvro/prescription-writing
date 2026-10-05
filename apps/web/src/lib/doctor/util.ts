import { ageParts } from "@rx/core";

/** Local calendar date (the doctor's machine is in Bangladesh), yyyy-mm-dd. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const nowIso = () => new Date().toISOString();

export const uuid = () => crypto.randomUUID();

export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export { ageParts };

export function ageLabel(dob: string | null | undefined): string {
  const a = ageParts(dob);
  if (!a) return "";
  if (a.years >= 2) return `${a.years}Y`;
  if (a.years >= 1 || a.months >= 1) return `${a.years * 12 + a.months}M`;
  return `${a.days}D`;
}

/** Back-calculate a date of birth from an age the patient tells us. */
export function dobFromAge(years: number, months = 0, days = 0): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setMonth(d.getMonth() - months);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Random URL-safe token for the QR verification link. */
export function randomToken(bytes = 12): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Normalise BD mobile numbers to 01XXXXXXXXX. */
export function normaliseMobile(input: string): string {
  const digits = input.replace(/[^\d০-৯]/g, "").replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)));
  if (digits.startsWith("880")) return `0${digits.slice(3)}`;
  if (digits.startsWith("88")) return digits.slice(2);
  return digits;
}
