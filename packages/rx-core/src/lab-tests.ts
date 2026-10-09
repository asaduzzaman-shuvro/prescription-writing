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

export const LAB_LIMITS = { results: 60, text: 200, title: 120, labName: 120, conclusion: 2000, files: 10 } as const;

/** A photo or PDF of the paper report, kept on the server (never printed). */
export interface LabFileRef {
  id: string;
  type: LabFileType;
}

export const LAB_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type LabFileType = (typeof LAB_FILE_TYPES)[number];
/** Photos are shrunk on the device first (about 150–300 KB a page); a scanned PDF may be larger. */
export const LAB_FILE_MAX_BYTES = 5 * 1024 * 1024;

/** The file's real type from its first bytes (never trust the name or the browser's claim). */
export function sniffLabFileType(b: Uint8Array): LabFileType | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, k) => b[i + k] === x);
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks a lab report before it's saved. The client runs it before writing and the upload endpoint runs it
 * again, so a report the doctor saw saved is never rejected later. Returns the problem, or null.
 * Only the fields present are checked (an upload may change a few of them).
 */
export function labReportProblem(r: { results?: unknown; title?: unknown; labName?: unknown; conclusion?: unknown; reportDate?: unknown; files?: unknown }, today: string): string | null {
  const str = (v: unknown, max: number, what: string) =>
    v === undefined || v === null ? null : typeof v !== "string" ? `${what} must be text` : v.length > max ? `${what} is too long (max ${max})` : null;
  const problem = str(r.title, LAB_LIMITS.title, "title") ?? str(r.labName, LAB_LIMITS.labName, "lab name") ?? str(r.conclusion, LAB_LIMITS.conclusion, "conclusion");
  if (problem) return problem;
  if (r.reportDate !== undefined && r.reportDate !== null) {
    if (typeof r.reportDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.reportDate)) return "report date must be YYYY-MM-DD";
    if (r.reportDate > today) return "report date is in the future";
  }
  if (r.files !== undefined && r.files !== null) {
    if (!Array.isArray(r.files)) return "files must be a list";
    if (r.files.length > LAB_LIMITS.files) return `too many files (max ${LAB_LIMITS.files})`;
    for (const f of r.files as Record<string, unknown>[]) {
      if (!f || typeof f.id !== "string" || !UUID_RE.test(f.id) || !LAB_FILE_TYPES.includes(f.type as LabFileType)) return "invalid file";
    }
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

// ---------------------------------------------------------------------------
// Quick entry, ordered tests, trends
// ---------------------------------------------------------------------------

/** What doctors type for each test (compared without spaces/dots, lower-case). */
const ALIASES: Record<string, string[]> = {
  "718-7": ["hb", "hgb", "hb%", "haemoglobin", "hemoglobin"],
  "30341-2": ["esr"],
  "6690-2": ["wbc", "tc", "totalcount", "wbccount"],
  "770-8": ["n", "neut", "neutrophil", "neutrophils", "poly"],
  "736-9": ["l", "lymph", "lymphocyte", "lymphocytes"],
  "777-3": ["plt", "platelet", "platelets", "pc"],
  "14749-6": ["rbs"],
  "14771-0": ["fbs"],
  "14761-1": ["2habf", "abf", "ppbs", "2hpp"],
  "4548-4": ["hba1c", "a1c"],
  "2160-0": ["cr", "creat", "creatinine", "screatinine", "scr", "screat"],
  "3091-6": ["urea", "bu", "burea"],
  "98979-8": ["egfr", "gfr"],
  "3084-1": ["ua", "uricacid", "suricacid"],
  "1742-6": ["sgpt", "alt"],
  "1920-8": ["sgot", "ast"],
  "1975-2": ["bil", "bili", "bilirubin", "sbilirubin", "tbil"],
  "2093-3": ["chol", "cholesterol", "tchol", "tcholesterol"],
  "2571-8": ["tg", "triglyceride", "triglycerides"],
  "2085-9": ["hdl"],
  "13457-7": ["ldl"],
  "3016-3": ["tsh"],
  "14920-3": ["ft4"],
  "5821-4": ["pus", "puscell", "puscells"],
  "13945-1": ["rbc", "urbc"],
  "20454-5": ["alb", "albumin", "protein", "ualb"],
  "25428-4": ["usugar", "urinesugar"],
  "2951-2": ["na", "sodium", "sna"],
  "2823-3": ["k", "potassium", "sk"],
  "2075-0": ["cl", "chloride", "scl"],
  "2028-9": ["hco3", "bicarb", "bicarbonate", "tco2"],
  "5196-1": ["hbsag"],
  "16128-1": ["antihcv", "hcv"],
  "1988-5": ["crp"],
};
const norm = (s: string) => s.toLowerCase().replace(/[\s.\-_]/g, "");
const ALIAS_TO_CODE: Record<string, string> = Object.fromEntries(Object.entries(ALIASES).flatMap(([code, names]) => names.map((n) => [norm(n), code])));

/** Words for a coded result, per kind of test. */
const CODED_WORDS: Record<string, string> = {
  pos: "Positive", positive: "Positive", "+ve": "Positive", reactive: "Positive",
  neg: "Negative", negative: "Negative", "-ve": "Negative", nonreactive: "Negative",
  nil: "Nil", trace: "Trace", "+": "+", "++": "++", "+++": "+++", "++++": "++++",
};

export interface ShorthandResult {
  results: { code: string; value?: number; text?: string }[];
  /** Pieces that weren't understood, so the doctor can correct them. */
  unknown: string[];
}

/**
 * Quick entry: "hb 9.2 wbc 11800 rbs 11.4 hbsag neg" → results by test code.
 * Name and value may be joined ("hb9.2") or separated by ":", "=" or ",".
 */
export function parseLabShorthand(input: string): ShorthandResult {
  const tokens = input
    .split(/[\s,;:=]+/)
    .filter(Boolean)
    .flatMap((t) => {
      const m = /^([a-z][a-z0-9%]*?)(\d+(?:\.\d+)?)$/i.exec(t);
      return m && ALIAS_TO_CODE[norm(m[1]!)] ? [m[1]!, m[2]!] : [t];
    });
  const out: ShorthandResult = { results: [], unknown: [] };
  let name: string[] = [];
  for (const tok of tokens) {
    const n = /^\d+(?:\.\d+)?$/.test(tok) ? Number(tok) : undefined;
    const word = CODED_WORDS[tok.toLowerCase()];
    if (n === undefined && word === undefined) {
      name.push(tok);
      continue;
    }
    const label = name.join(" ");
    name = [];
    const code = ALIAS_TO_CODE[norm(label)];
    const test = code ? LAB_TEST_BY_CODE[code] : undefined;
    if (!label || !test) {
      out.unknown.push(`${label} ${tok}`.trim());
      continue;
    }
    if (test.kind === "coded") {
      if (word && test.options?.includes(word)) out.results.push({ code: test.code, text: word });
      else out.unknown.push(`${label} ${tok}`);
    } else if (n !== undefined) out.results.push({ code: test.code, value: n });
    else out.unknown.push(`${label} ${tok}`);
  }
  if (name.length) out.unknown.push(name.join(" "));
  return out;
}

/** The panel a test belongs to (the first one listing it). */
export function panelOfTest(code: string): LabPanel | undefined {
  return LAB_PANELS.find((p) => p.tests.includes(code));
}

const ORDERED_PANELS: [RegExp, string][] = [
  [/urine\s*r\/?m?\/?e|urine routine/i, "urine"],
  [/\bcbc\b|hb%|haemoglobin|hemoglobin|platelet|eosinophil|\besr\b/i, "cbc"],
  [/\brbs\b|\bfbs\b|2habf|hba1c|blood sugar|glucose/i, "sugar"],
  [/creatinine|\burea\b|uric acid|egfr|\brft\b|renal function/i, "rft"],
  [/sgpt|sgot|\balt\b|\bast\b|bilirubin|\blft\b|liver function/i, "lft"],
  [/lipid|cholesterol|triglycer/i, "lipid"],
  [/\btsh\b|\bft4\b|thyroid/i, "thyroid"],
  [/electrolyte/i, "electrolytes"],
  [/hbsag|\bhcv\b|\bcrp\b/i, "serology"],
];

/**
 * Where to record the result of an ordered investigation: a panel, or a free-text report titled with its name
 * (imaging, ECG, cultures…).
 */
export function panelForInvestigation(name: string): { panel: string; title?: string } {
  const hit = ORDERED_PANELS.find(([re]) => re.test(name));
  return hit ? { panel: hit[1] } : { panel: OTHER_PANEL, title: name };
}

export interface TrendPoint {
  date: string;
  value: number;
  flag?: LabFlag;
}

/**
 * A small trend chart's geometry in a w×h box: point positions (oldest left) and the normal band.
 * The vertical scale covers the values and the range, with a little headroom.
 */
export function labTrend(points: TrendPoint[], range: LabRange, w: number, h: number, pad = 6) {
  const values = [...points.map((p) => p.value), ...[range.low, range.high].filter((x): x is number => x !== undefined)];
  let lo = Math.min(...values), hi = Math.max(...values);
  if (lo === hi) { lo -= 1; hi += 1; }
  const span = hi - lo;
  lo -= span * 0.1; hi += span * 0.1;
  const y = (v: number) => Math.round((pad + (1 - (v - lo) / (hi - lo)) * (h - 2 * pad)) * 10) / 10;
  const x = (i: number) => Math.round((points.length === 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (points.length - 1)) * 10) / 10;
  return {
    points: points.map((p, i) => ({ ...p, x: x(i), y: y(p.value) })),
    band: range.low !== undefined || range.high !== undefined
      ? { top: range.high !== undefined ? y(range.high) : pad, bottom: range.low !== undefined ? y(range.low) : h - pad }
      : null,
  };
}
