import { ageParts } from "@rx/core";

/** Local calendar date (the doctor's machine is in Bangladesh), yyyy-mm-dd. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const nowIso = () => new Date().toISOString();

/** Timestamp whose text starts with the doctor's local calendar date. */
export function localNowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

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

/** Bound parameters for patient search (place after group/chamber WHERE params, before LIMIT/OFFSET). */
export function patientSearchClause(term: string): { sql: string; params: string[] } {
  const raw = term.trim();
  if (raw.length < 2) return { sql: "", params: [] };
  const tokens = raw.split(/\s+/).filter((t) => t.length > 0);
  const params: string[] = [];
  const clauses = tokens.map((token) => {
    const mobile = normaliseMobile(token);
    const digits = token.replace(/\D/g, "");
    const nameLike = `%${token}%`;
    const codeLike = `%${token}%`;
    const codeDigitsLike = digits ? `%${digits}%` : `%${token}%`;
    const mobileDigits = mobile.replace(/\D/g, "");
    const parts = [
      "lower(p.name) LIKE lower(?)",
      "p.code LIKE ?",
      "REPLACE(COALESCE(p.code, ''), 'P-', '') LIKE ?",
    ];
    params.push(nameLike, codeLike, codeDigitsLike);
    if (mobileDigits.length >= 3) {
      const mobileLike = `%${mobileDigits}%`;
      parts.push("p.mobile LIKE ?", "REPLACE(COALESCE(p.mobile, ''), ' ', '') LIKE ?");
      params.push(mobileLike, mobileLike);
    }
    return `(${parts.join("\n      OR ")})`;
  });
  return { sql: `AND ${clauses.join(" AND ")}`, params };
}

/** @deprecated Prefer patientSearchClause — embedded literals break PowerSync watch updates. */
export function patientSearchSql(term: string): string {
  const { sql } = patientSearchClause(term);
  return sql;
}

/**
 * Marks a visit whose prescription was just finalised, so the browser's Back from the print screen
 * opens it for editing. Kept for the tab only; without storage the visit simply opens locked.
 * (Not history.replaceState: Next.js wraps it and puts back its own URL.)
 */
export const resumeEditAfterPrint = {
  key: (encounterId: string) => `rx-resume-edit:${encounterId}`,
  set(encounterId: string) {
    try { sessionStorage.setItem(this.key(encounterId), "1"); } catch { /* storage unavailable */ }
  },
  has(encounterId: string) {
    try { return typeof window !== "undefined" && sessionStorage.getItem(this.key(encounterId)) === "1"; } catch { return false; }
  },
  clear(encounterId: string) {
    try { sessionStorage.removeItem(this.key(encounterId)); } catch { /* storage unavailable */ }
  },
};
