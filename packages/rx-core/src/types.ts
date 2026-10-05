/**
 * Shared prescription document model. Used by the doctor UI, the sync layer
 * (stored as JSON on the prescription row), and the print renderer.
 */

export type Sex = "male" | "female" | "other";

/** Which side an ear/nose/eye medicine is applied to. */
export type Side = "right" | "left" | "both";

export type Route =
  | "oral"
  | "ear"
  | "nose"
  | "eye"
  | "topical"
  | "inhalation"
  | "gargle"
  | "injection"
  | "rectal"
  | "vaginal"
  | "sublingual"
  | "other";

export type DoseUnit =
  | "tab"
  | "cap"
  | "tsf" // teaspoon (5 ml)
  | "ml"
  | "drop"
  | "puff"
  | "spray"
  | "sachet"
  | "amp"
  | "vial"
  | "supp"
  | "application"
  | "unit";

/** Timing relative to food / sleep. */
export type Timing = "after_food" | "before_food" | "with_food" | "empty_stomach" | "bedtime" | "none";

/**
 * How often a medicine is taken.
 * - `pattern`: BD-style slots, morning+noon+night (3 slots) or morning+noon+evening+night (4 slots).
 * - `times_per_day`: e.g. drops "3 times daily".
 * - `every_hours`: e.g. every 6 hours.
 * - `sos`: as needed; `stat`: once immediately; `weekly`: once a week.
 */
export type Frequency =
  | { kind: "pattern"; slots: number[] }
  | { kind: "times_per_day"; times: number }
  | { kind: "every_hours"; hours: number }
  | { kind: "sos" }
  | { kind: "stat" }
  | { kind: "weekly"; times: number };

export type DurationUnit = "day" | "week" | "month";

export type Duration = { kind: "fixed"; value: number; unit: DurationUnit } | { kind: "continue" } | { kind: "none" };

export interface RxItem {
  id: string;
  /** Catalogue product id when picked from the medicine DB; absent for free-text medicines. */
  productId?: string | null;
  /** Dosage form label, e.g. "Tab.", "Syp.", "Ear Drop". */
  form?: string;
  brandName: string;
  /** Snapshot of the generic at prescribing time (catalogue can change later). */
  genericName?: string;
  strength?: string;
  frequency: Frequency;
  /** Amount per dose; for `pattern` slots this multiplies the slot value when the unit is not tab/cap. */
  doseQty?: number;
  doseUnit?: DoseUnit;
  route?: Route;
  side?: Side;
  timing?: Timing;
  duration: Duration;
  /** Free-text instruction in Bangla or English, printed under the line. */
  note?: string;
  /** Set for antibiotics so the print adds the "finish the full course" line. */
  isAntibiotic?: boolean;
}

export interface Vitals {
  bpSystolic?: number;
  bpDiastolic?: number;
  pulse?: number;
  tempF?: number;
  weightKg?: number;
  heightCm?: number;
  spo2?: number;
  respRate?: number;
}

/** A specialty exam finding rendered as "Label: value" lines in the clinical column. */
export interface ExamFindingLine {
  label: string;
  value: string;
}

export interface PrescriptionDoc {
  /** Referring doctor, printed as "Ref By: Dr. X". */
  referredBy?: string;
  chiefComplaints: string[];
  history?: string;
  vitals: Vitals;
  /** General O/E findings as "Label : value" lines (Pulse : Normal, Fundus : NAD). */
  oeFindings?: ExamFindingLine[];
  examination?: string;
  /** Structured specialty exam (e.g. ENT) already flattened to printable lines. */
  specialtyFindings?: { title: string; lines: ExamFindingLine[] }[];
  investigations: string[];
  diagnoses: string[];
  /** Management plan, including referrals out ("Refd to … Dept., BSMMU"). */
  plan?: string[];
  /** Notes such as birth weight or past history (H/O). */
  notes?: string[];
  items: RxItem[];
  /** Free text printed under the medicines, e.g. a reply letter to the referring doctor. */
  rxNote?: string;
  advice: string[];
  followUp?: { kind: "after"; value: number; unit: DurationUnit } | { kind: "date"; date: string } | { kind: "none" };
  /** Optional small vector diagrams (inline SVG markup). Untrusted: the renderer sanitises them. */
  diagrams?: { title: string; svg: string }[];
  /** This patient's visit count (1 = first visit), fixed when the prescription is finalised. */
  visitNo?: number;
}

export interface PatientInfo {
  name: string;
  ageYears?: number;
  ageMonths?: number;
  ageDays?: number;
  sex?: Sex;
  mobile?: string;
  patientCode?: string;
  address?: string;
  /** Neonatal history; printed in the Note section while the child is under 2. */
  birthWeightKg?: number;
  gestationalAgeWeeks?: number;
}

export interface DoctorHeader {
  nameEn: string;
  nameBn?: string;
  degreesEn: string[];
  degreesBn?: string[];
  designation?: string;
  institution?: string;
  specialty?: string;
  bmdcNumber: string;
}

export type Weekday = "sat" | "sun" | "mon" | "tue" | "wed" | "thu" | "fri";

/** A visiting (or operation) slot of a chamber. Times are 24-hour "HH:MM". */
export interface ChamberSlot {
  /** e.g. "রোগী দেখার সময়", "অপারেশন"; printed before the days. */
  label?: string;
  days: Weekday[];
  from?: string;
  to?: string;
}

export interface ChamberHeader {
  name: string;
  address: string;
  phone?: string;
  /** Free-text hours (older chambers); `schedule` is printed instead when present. */
  hours?: string;
  schedule?: ChamberSlot[];
  serialPhone?: string;
  /** Policy line printed in the footer. */
  footerText?: string;
  logoDataUrl?: string;
}
