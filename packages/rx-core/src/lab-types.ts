/**
 * Lab catalogue types: tests, panels and stored results. The curated catalogue (lab-catalogue/) is written with the
 * builders here; the database holds the same shape as rows (see lab-tests.ts labTestRow / buildLabCatalogue).
 */

export interface LabRange {
  low?: number;
  high?: number;
}

/** A range for some patients only: by sex, by age, or both (ages in days, `maxAgeDays` exclusive). */
export interface LabRangeBand extends LabRange {
  sex?: "male" | "female";
  minAgeDays?: number;
  maxAgeDays?: number;
}

export type LabTestKind = "numeric" | "coded" | "text" | "titre" | "culture";

/** How Bangladeshi labs group their reports (and print them: one department per page). */
export const LAB_DEPARTMENTS = [
  { id: "haematology", name: "Haematology" },
  { id: "biochemistry", name: "Biochemistry" },
  { id: "clinical_pathology", name: "Clinical pathology" },
  { id: "serology", name: "Serology & immunology" },
  { id: "blood_bank", name: "Blood bank" },
  { id: "hormone", name: "Hormones" },
  { id: "tumour_marker", name: "Tumour markers" },
  { id: "coagulation", name: "Coagulation" },
  { id: "microbiology", name: "Microbiology" },
] as const;
export type LabDepartment = (typeof LAB_DEPARTMENTS)[number]["id"];
export const isLabDepartment = (v: unknown): v is LabDepartment => LAB_DEPARTMENTS.some((d) => d.id === v);

export interface LabTest {
  /** LOINC code where there is one, else "bd-…" (platform) or "x-…" (a clinic's own test). Results are stored under it. */
  code: string;
  name: string;
  /** Printed name, e.g. "Hb". */
  short: string;
  unit: string;
  kind: LabTestKind;
  department: LabDepartment;
  /** Coded and titre results: the choices. Text results: suggestions. */
  options?: string[];
  /** Coded and text results: the normal ones (anything else is flagged A). None: never flagged. */
  normal?: string[];
  range?: LabRange & { male?: LabRange; female?: LabRange; bands?: LabRangeBand[] };
  /** The printed reference range, where it isn't a plain low–high (e.g. lipid targets, hormone phases). */
  refText?: string;
  /** Labs print some counts per cmm (e.g. WBC 11,800): values at or above this are divided by 1000. */
  perCmmFrom?: number;
  /** A lab report prints the value per cmm (11.8 ×10³/µL → 11,800 /cumm). */
  printAs?: "per_cmm";
  /** Decimal places printed on a lab report. */
  decimals?: number;
  /** Microscopy counts: "2-4" (judged on the upper figure) or words like "Plenty". */
  allowRange?: boolean;
  /** Titres at or above this are flagged (e.g. "1:160"). */
  titreSignificant?: string;
  /** Cultures: the antibiotics a sensitivity table offers. */
  antibiotics?: string[];
  /** What doctors type for it in quick entry (compared without spaces/dots, lower-case). */
  aliases?: string[];
  method?: string;
}

/** A panel is what a lab reports together (one paper report); "other" is a free-text report (imaging, ECG…). */
export interface LabPanel {
  id: string;
  name: string;
  /** LOINC panel code, where one exists. */
  code?: string;
  department: LabDepartment;
  specimen?: string;
  layout?: "table" | "culture";
  /** Headings a report prints its rows under (Urine R/M/E: Physical, Chemical, Microscopic). */
  sections?: { title?: string; tests: string[] }[];
  /** Every test, in order (the sections flattened). */
  tests: string[];
  aliases?: string[];
}

export type LabFlag = "H" | "L" | "A";

export type LabSir = "S" | "I" | "R";

export interface LabCultureResult {
  growth: boolean;
  organisms: { name: string; count?: string; sensitivity: { drug: string; sir: LabSir; zone?: string }[] }[];
}

export interface LabResult {
  code: string;
  value?: number;
  /** Coded, titre or text result ("Positive", "1:160"), or a microscopy count as written ("2-4"). */
  text?: string;
  unit: string;
  /** The range printed on the lab's report, when entered. */
  low?: number;
  high?: number;
  flag?: LabFlag;
  /** Print this value on the prescription (on by default for abnormal values). */
  print: boolean;
  /** The test's printed name and reference range when saved, so a later catalogue edit doesn't change old reports. */
  name?: string;
  ref?: string;
  /** The panel section it was entered under ("Microscopic"). */
  section?: string;
  culture?: LabCultureResult;
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

// Builders for the curated catalogue ------------------------------------------------------------------------------

type Extra = Partial<Omit<LabTest, "code" | "short" | "name" | "unit" | "kind" | "department">>;

/** Builders bound to one department: `const { num, coded } = labBuilders("haematology")`. */
export function labBuilders(department: LabDepartment) {
  const base = (code: string, short: string, name: string, unit: string, kind: LabTestKind, extra: Extra = {}): LabTest => ({
    code, short, name, unit, kind, department, ...extra,
  });
  return {
    num: (code: string, short: string, name: string, unit: string, range?: LabTest["range"], extra: Extra = {}) =>
      base(code, short, name, unit, "numeric", { ...(range ? { range } : {}), ...extra }),
    coded: (code: string, short: string, name: string, options: string[], normal?: string[], extra: Extra = {}) =>
      base(code, short, name, "", "coded", { options, ...(normal ? { normal } : {}), ...extra }),
    text: (code: string, short: string, name: string, extra: Extra = {}) => base(code, short, name, "", "text", extra),
    titre: (code: string, short: string, name: string, significant: string, extra: Extra = {}) =>
      base(code, short, name, "", "titre", { options: TITRES, titreSignificant: significant, ...extra }),
    culture: (code: string, short: string, name: string, extra: Extra = {}) =>
      base(code, short, name, "", "culture", { antibiotics: CULTURE_ANTIBIOTICS, ...extra }),
  };
}

export function labPanelDef(
  id: string,
  name: string,
  department: LabDepartment,
  sections: string[] | { title?: string; tests: string[] }[],
  extra: Partial<Omit<LabPanel, "id" | "name" | "department" | "tests" | "sections">> = {},
): LabPanel {
  const secs = typeof sections[0] === "string" ? undefined : (sections as { title?: string; tests: string[] }[]);
  const tests = secs ? secs.flatMap((s) => s.tests) : (sections as string[]);
  return { id, name, department, tests, ...(secs ? { sections: secs } : {}), ...extra };
}

export const DIPSTICK = ["Nil", "Trace", "+", "++", "+++", "++++"];
export const NEG_POS = ["Negative", "Positive"];
export const NONREACTIVE = ["Non-reactive", "Reactive"];
export const ABSENT_PRESENT = ["Absent", "Present"];
export const TITRES = ["Nil", "1:20", "1:40", "1:80", "1:160", "1:320", "1:640", "1:1280"];

/** Antibiotics Bangladeshi labs usually test (a clinic can change the list per culture). */
export const CULTURE_ANTIBIOTICS = [
  "Amoxicillin", "Amoxiclav", "Azithromycin", "Cefixime", "Cefuroxime", "Ceftriaxone", "Ceftazidime", "Cefepime",
  "Ciprofloxacin", "Levofloxacin", "Cotrimoxazole", "Nitrofurantoin", "Fosfomycin", "Gentamicin", "Amikacin",
  "Doxycycline", "Piperacillin-tazobactam", "Meropenem", "Imipenem", "Colistin", "Vancomycin", "Linezolid",
];
