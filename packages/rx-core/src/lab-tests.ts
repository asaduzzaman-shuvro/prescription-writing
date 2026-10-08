import { formatDateDmy } from "./dates";
import type { Sex } from "./types";

/**
 * Lab reports: the tests a doctor records from a patient's paper reports, their units and usual adult ranges,
 * and the rules for flagging and printing results. Codes are LOINC (as the DGHS Bangladesh Core FHIR IG expects);
 * units are the ones Bangladeshi labs print. A lab's own printed range, when entered, wins over the defaults here.
 */

export interface LabRange {
  low?: number;
  high?: number;
}

export interface LabTest {
  /** LOINC code; also the key results are stored under. */
  code: string;
  name: string;
  /** Printed name, e.g. "Hb". */
  short: string;
  unit: string;
  kind: "numeric" | "coded";
  /** Coded results: the choices, and which of them are normal. */
  options?: string[];
  normal?: string[];
  range?: LabRange & { male?: LabRange; female?: LabRange };
  /** Labs print some counts per cmm (e.g. WBC 11,800): values at or above this are divided by 1000. */
  perCmmFrom?: number;
}

/** A panel is what a lab reports together (one paper report); "other" is a free-text report (imaging, ECG…). */
export interface LabPanel {
  id: string;
  name: string;
  /** LOINC panel code, where one exists. */
  code?: string;
  tests: string[];
}

export type LabFlag = "H" | "L" | "A";

export interface LabResult {
  code: string;
  value?: number;
  /** Coded result (e.g. "Positive", "Trace"). */
  text?: string;
  unit: string;
  /** The range printed on the lab's report, when entered. */
  low?: number;
  high?: number;
  flag?: LabFlag;
  /** Print this value on the prescription (on by default for abnormal values). */
  print: boolean;
}

export interface LabReport {
  panel: string;
  title: string;
  reportDate: string;
  labName?: string;
  results: LabResult[];
  /** Free-text finding of an imaging/ECG/other report. */
  conclusion?: string;
}

const t = (code: string, short: string, name: string, unit: string, range?: LabTest["range"], extra: Partial<LabTest> = {}): LabTest => ({
  code, short, name, unit, kind: "numeric", ...(range ? { range } : {}), ...extra,
});
const coded = (code: string, short: string, name: string, options: string[], normal: string[]): LabTest => ({
  code, short, name, unit: "", kind: "coded", options, normal,
});

const DIPSTICK = ["Nil", "Trace", "+", "++", "+++", "++++"];

export const LAB_TESTS: LabTest[] = [
  // CBC
  t("718-7", "Hb", "Haemoglobin", "g/dL", { male: { low: 13, high: 17 }, female: { low: 12, high: 15 } }),
  t("30341-2", "ESR", "ESR", "mm/1st hr", { male: { high: 15 }, female: { high: 20 } }),
  t("6690-2", "WBC", "Total WBC count", "×10³/µL", { low: 4, high: 11 }, { perCmmFrom: 1000 }),
  t("770-8", "Neutrophils", "Neutrophils", "%", { low: 40, high: 75 }),
  t("736-9", "Lymphocytes", "Lymphocytes", "%", { low: 20, high: 45 }),
  t("777-3", "Platelets", "Platelet count", "×10³/µL", { low: 150, high: 400 }, { perCmmFrom: 5000 }),
  // Sugar
  t("14749-6", "RBS", "Random blood sugar", "mmol/L", { high: 7.8 }),
  t("14771-0", "FBS", "Fasting blood sugar", "mmol/L", { low: 3.9, high: 6.1 }),
  t("14761-1", "2HABF", "Blood sugar 2 h after breakfast", "mmol/L", { high: 7.8 }),
  t("4548-4", "HbA1c", "HbA1c", "%", { high: 5.7 }),
  // Renal
  t("2160-0", "S. creatinine", "Serum creatinine", "mg/dL", { low: 0.6, high: 1.2 }),
  t("3091-6", "Urea", "Blood urea", "mg/dL", { low: 15, high: 40 }),
  t("98979-8", "eGFR", "eGFR", "mL/min/1.73m²", { low: 90 }),
  t("3084-1", "Uric acid", "Serum uric acid", "mg/dL", { male: { high: 7 }, female: { high: 6 } }),
  // Liver
  t("1742-6", "SGPT", "SGPT (ALT)", "U/L", { high: 40 }),
  t("1920-8", "SGOT", "SGOT (AST)", "U/L", { high: 40 }),
  t("1975-2", "Bilirubin", "Total bilirubin", "mg/dL", { high: 1.2 }),
  // Lipids
  t("2093-3", "T. cholesterol", "Total cholesterol", "mg/dL", { high: 200 }),
  t("2571-8", "TG", "Triglycerides", "mg/dL", { high: 150 }),
  t("2085-9", "HDL", "HDL cholesterol", "mg/dL", { low: 40 }),
  t("13457-7", "LDL", "LDL cholesterol", "mg/dL", { high: 100 }),
  // Thyroid
  t("3016-3", "TSH", "TSH", "µIU/mL", { low: 0.4, high: 4.5 }),
  t("14920-3", "FT4", "Free T4", "pmol/L", { low: 12, high: 22 }),
  // Urine R/E
  t("5821-4", "Pus cells", "Urine pus cells", "/HPF", { high: 5 }),
  t("13945-1", "RBC", "Urine RBC", "/HPF", { high: 2 }),
  coded("20454-5", "Albumin", "Urine albumin (protein)", DIPSTICK, ["Nil"]),
  coded("25428-4", "Sugar", "Urine sugar", DIPSTICK, ["Nil"]),
  // Electrolytes
  t("2951-2", "Na", "Serum sodium", "mmol/L", { low: 135, high: 145 }),
  t("2823-3", "K", "Serum potassium", "mmol/L", { low: 3.5, high: 5.1 }),
  t("2075-0", "Cl", "Serum chloride", "mmol/L", { low: 98, high: 107 }),
  t("2028-9", "HCO₃", "Bicarbonate", "mmol/L", { low: 22, high: 29 }),
  // Serology / inflammation
  coded("5196-1", "HBsAg", "HBsAg", ["Negative", "Positive"], ["Negative"]),
  coded("16128-1", "Anti-HCV", "Anti-HCV", ["Negative", "Positive"], ["Negative"]),
  t("1988-5", "CRP", "C-reactive protein", "mg/L", { high: 6 }),
];

export const LAB_TEST_BY_CODE: Record<string, LabTest> = Object.fromEntries(LAB_TESTS.map((x) => [x.code, x]));

export const OTHER_PANEL = "other";

export const LAB_PANELS: LabPanel[] = [
  { id: "cbc", name: "CBC", code: "58410-2", tests: ["718-7", "30341-2", "6690-2", "770-8", "736-9", "777-3"] },
  { id: "sugar", name: "Blood sugar", tests: ["14749-6", "14771-0", "14761-1", "4548-4"] },
  { id: "rft", name: "RFT", tests: ["2160-0", "3091-6", "98979-8", "3084-1"] },
  { id: "lft", name: "LFT", tests: ["1742-6", "1920-8", "1975-2"] },
  { id: "lipid", name: "Lipid profile", code: "24331-1", tests: ["2093-3", "2571-8", "2085-9", "13457-7"] },
  { id: "thyroid", name: "Thyroid", tests: ["3016-3", "14920-3"] },
  { id: "urine", name: "Urine R/E", code: "24356-8", tests: ["5821-4", "13945-1", "20454-5", "25428-4"] },
  { id: "electrolytes", name: "Electrolytes", code: "24326-1", tests: ["2951-2", "2823-3", "2075-0", "2028-9"] },
  { id: "serology", name: "Serology", tests: ["5196-1", "16128-1", "1988-5"] },
];

/** Usual titles for a free-text report (the doctor may type any other). */
export const OTHER_REPORT_TITLES = [
  "X-ray chest P/A view",
  "USG of whole abdomen",
  "ECG",
  "Echocardiography",
  "CT scan",
  "MRI",
  "Pure tone audiometry (PTA)",
  "Endoscopy",
];

export const labPanel = (id: string) => LAB_PANELS.find((p) => p.id === id);

/** The range a result is judged against: the lab's own, else the default for the patient's sex. */
export function labRange(test: LabTest, sex: Sex | null | undefined, result?: Pick<LabResult, "low" | "high">): LabRange {
  if (result && (result.low !== undefined || result.high !== undefined)) return { low: result.low, high: result.high };
  const r = test.range;
  if (!r) return {};
  const bySex = sex === "male" ? r.male : sex === "female" ? r.female : undefined;
  if (bySex) return bySex;
  // Unknown sex with only sex-specific ranges: the widest span, so nothing is flagged that's normal for either.
  if (r.male || r.female) {
    const lows = [r.male?.low, r.female?.low].filter((x): x is number => x !== undefined);
    const highs = [r.male?.high, r.female?.high].filter((x): x is number => x !== undefined);
    return { low: lows.length ? Math.min(...lows) : undefined, high: highs.length ? Math.max(...highs) : undefined };
  }
  return { low: r.low, high: r.high };
}

/** A count typed per cmm (WBC 11800) in the test's ×10³/µL unit (11.8). */
export function normaliseLabValue(test: LabTest, value: number): number {
  return test.perCmmFrom !== undefined && value >= test.perCmmFrom ? Math.round((value / 1000) * 100) / 100 : value;
}

/** H/L for numbers outside the range, A for an abnormal coded result. */
export function labFlag(test: LabTest, result: Pick<LabResult, "value" | "text" | "low" | "high">, sex: Sex | null | undefined): LabFlag | undefined {
  if (test.kind === "coded") return result.text && !(test.normal ?? []).includes(result.text) ? "A" : undefined;
  if (result.value === undefined || !Number.isFinite(result.value)) return undefined;
  const { low, high } = labRange(test, sex, result);
  if (low !== undefined && result.value < low) return "L";
  if (high !== undefined && result.value > high) return "H";
  return undefined;
}

/** A result as entered → stored: normalised value, the flag, and printing on for abnormal values. */
export function labResult(test: LabTest, input: { value?: number; text?: string; low?: number; high?: number; print?: boolean }, sex: Sex | null | undefined): LabResult {
  const value = input.value !== undefined && Number.isFinite(input.value) ? normaliseLabValue(test, input.value) : undefined;
  const r: LabResult = { code: test.code, unit: test.unit, print: false };
  if (value !== undefined) r.value = value;
  if (input.text) r.text = input.text;
  if (input.low !== undefined) r.low = input.low;
  if (input.high !== undefined) r.high = input.high;
  const flag = labFlag(test, r, sex);
  if (flag) r.flag = flag;
  r.print = input.print ?? flag !== undefined;
  return r;
}

const num = (n: number) => String(Math.round(n * 100) / 100);

/** "Hb 9.2 g/dL (L)", "HBsAg Positive". */
export function labValueText(r: LabResult): string {
  const test = LAB_TEST_BY_CODE[r.code];
  const name = test?.short ?? r.code;
  if (r.text !== undefined && r.value === undefined) return `${name} ${r.text}`;
  const flag = r.flag === "H" || r.flag === "L" ? ` (${r.flag})` : "";
  return `${name} ${r.value !== undefined ? num(r.value) : ""}${r.unit ? ` ${r.unit}` : ""}${flag}`.replace(/\s+/g, " ").trim();
}

/**
 * One printed line per report, e.g. "CBC (12/10/26): Hb 9.2 g/dL (L), WBC 11.8 ×10³/µL (H)".
 * With `onlyPrinted`, only ticked values (and the conclusion) appear; a report with nothing to print gives null.
 */
export function labLine(report: LabReport, opts: { onlyPrinted: boolean }): { title: string; date: string; text: string } | null {
  const values = report.results.filter((r) => !opts.onlyPrinted || r.print).map(labValueText);
  const parts = [...values, ...(report.conclusion?.trim() ? [report.conclusion.trim()] : [])];
  if (!parts.length) return null;
  const date = report.reportDate;
  return { title: report.title, date, text: `${report.title} (${formatDateDmy(date, "en", "/").replace(/\/(\d{2})(\d{2})$/, "/$2")}): ${parts.join(", ")}` };
}

export const LAB_LIMITS = { results: 60, text: 200, title: 120, labName: 120, conclusion: 2000 } as const;

/**
 * Checks a lab report before it's saved. The client runs it before writing and the upload endpoint runs it
 * again, so a report the doctor saw saved is never rejected later. Returns the problem, or null.
 * Only the fields present are checked (an upload may change a few of them).
 */
export function labReportProblem(r: { results?: unknown; title?: unknown; labName?: unknown; conclusion?: unknown; reportDate?: unknown }, today: string): string | null {
  const str = (v: unknown, max: number, what: string) =>
    v === undefined || v === null ? null : typeof v !== "string" ? `${what} must be text` : v.length > max ? `${what} is too long (max ${max})` : null;
  const problem = str(r.title, LAB_LIMITS.title, "title") ?? str(r.labName, LAB_LIMITS.labName, "lab name") ?? str(r.conclusion, LAB_LIMITS.conclusion, "conclusion");
  if (problem) return problem;
  if (r.reportDate !== undefined && r.reportDate !== null) {
    if (typeof r.reportDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.reportDate)) return "report date must be YYYY-MM-DD";
    if (r.reportDate > today) return "report date is in the future";
  }
  if (r.results === undefined || r.results === null) return null;
  if (!Array.isArray(r.results)) return "results must be a list";
  if (r.results.length > LAB_LIMITS.results) return `too many results (max ${LAB_LIMITS.results})`;
  for (const x of r.results as Record<string, unknown>[]) {
    if (!x || typeof x !== "object") return "invalid result";
    if (typeof x.code !== "string" || !x.code || x.code.length > 40) return "invalid result code";
    if (typeof x.unit !== "string" || x.unit.length > 20) return "invalid result unit";
    if (typeof x.print !== "boolean") return "invalid print flag";
    for (const k of ["value", "low", "high"] as const) if (x[k] !== undefined && (typeof x[k] !== "number" || !Number.isFinite(x[k]))) return `result ${k} must be a number`;
    if (x.text !== undefined && (typeof x.text !== "string" || x.text.length > LAB_LIMITS.text)) return "invalid result text";
    if (x.flag !== undefined && x.flag !== "H" && x.flag !== "L" && x.flag !== "A") return "invalid result flag";
  }
  return null;
}
