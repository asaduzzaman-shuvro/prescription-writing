import { formatDateDmy } from "./dates";
import { LAB_CURATED_PANELS, LAB_CURATED_TESTS } from "./lab-catalogue";
import {
  isLabDepartment,
  type LabCultureResult,
  type LabFlag,
  type LabPanel,
  type LabRange,
  type LabRangeBand,
  type LabReport,
  type LabResult,
  type LabTest,
  type LabTestKind,
} from "./lab-types";
import type { Sex } from "./types";

export * from "./lab-types";
export { LAB_CURATED_PANELS, LAB_CURATED_TESTS };

/**
 * Lab reports: the tests a clinic records (from a patient's paper report, or from its own lab), their units and
 * usual ranges, and the rules for flagging and printing results. Codes are LOINC where one exists (as the DGHS
 * Bangladesh Core FHIR IG expects); units are the ones Bangladeshi labs print. A lab's own printed range, when
 * entered, wins over the catalogue's.
 *
 * The catalogue is data: the curated default (lab-catalogue/) seeds the database, clinics adjust it there, and
 * devices merge both (buildLabCatalogue). Helpers take the catalogue to use, defaulting to the curated one.
 */
export interface LabCatalogue {
  /** Tests in use, in order. */
  tests: LabTest[];
  /** Panels in use, each holding only tests in use. */
  panels: LabPanel[];
  /** Every known test, hidden ones too, so old results still show their names. */
  byCode: Record<string, LabTest>;
  panelById: Record<string, LabPanel>;
  /** Tests the clinic has hidden. */
  hidden: ReadonlySet<string>;
  /** Quick-entry name → test code. */
  aliasToCode: Record<string, string>;
}

const norm = (s: string) => s.toLowerCase().replace(/[\s.\-_]/g, "");

export function makeLabCatalogue(tests: LabTest[], panels: LabPanel[], hidden: Iterable<string> = []): LabCatalogue {
  const hide = new Set(hidden);
  const byCode: Record<string, LabTest> = {};
  for (const t of tests) byCode[t.code] ??= t;
  const inUse = (c: string) => Boolean(byCode[c]) && !hide.has(c);
  const shown = Object.values(byCode).filter((t) => !hide.has(t.code));
  const usable = panels
    .map((p): LabPanel => {
      const sections = p.sections?.map((s) => ({ ...s, tests: s.tests.filter(inUse) })).filter((s) => s.tests.length);
      return { ...p, tests: p.tests.filter(inUse), ...(sections ? { sections } : {}) };
    })
    .filter((p) => p.tests.length);
  const aliasToCode: Record<string, string> = {};
  for (const t of shown) for (const a of t.aliases ?? []) aliasToCode[norm(a)] ??= t.code;
  return { tests: shown, panels: usable, byCode, panelById: Object.fromEntries(usable.map((p) => [p.id, p])), hidden: hide, aliasToCode };
}

export const DEFAULT_LAB_CATALOGUE = makeLabCatalogue(LAB_CURATED_TESTS, LAB_CURATED_PANELS);
export const LAB_TESTS = DEFAULT_LAB_CATALOGUE.tests;
export const LAB_TEST_BY_CODE = DEFAULT_LAB_CATALOGUE.byCode;
export const LAB_PANELS = DEFAULT_LAB_CATALOGUE.panels;

export const OTHER_PANEL = "other";

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

export const labPanel = (id: string, cat: LabCatalogue = DEFAULT_LAB_CATALOGUE): LabPanel | undefined => cat.panelById[id];

// ---------------------------------------------------------------------------
// Catalogue rows (the database's shape) and merging a clinic's changes
// ---------------------------------------------------------------------------

/** A lab_test row. Platform rows have no tenant; a clinic row with a platform code overrides it (nulls inherit). */
export interface LabTestRow {
  tenantId?: string | null;
  code: string;
  name?: string | null;
  short?: string | null;
  unit?: string | null;
  kind?: string | null;
  department?: string | null;
  sortOrder?: number | null;
  isActive?: boolean | null;
  /** The test's other fields (LabTestSpec); a clinic row's keys replace the platform row's. */
  spec?: unknown;
}

export interface LabPanelRow {
  tenantId?: string | null;
  key: string;
  name?: string | null;
  department?: string | null;
  sortOrder?: number | null;
  isActive?: boolean | null;
  /** LabPanelSpec. */
  spec?: unknown;
}

export type LabTestSpec = Partial<Omit<LabTest, "code" | "name" | "short" | "unit" | "kind" | "department">>;
export interface LabPanelSpec {
  code?: string;
  specimen?: string;
  layout?: "table" | "culture";
  sections?: { title?: string; tests: string[] }[];
  aliases?: string[];
}

const TEST_KINDS: LabTestKind[] = ["numeric", "coded", "text", "titre", "culture"];

/** The row the seed writes for a curated test. */
export function labTestRow(t: LabTest, sortOrder: number) {
  const { code, name, short, unit, kind, department, ...spec } = t;
  return { code, name, short, unit, kind, department, sortOrder, spec: spec as LabTestSpec };
}

export function labPanelRow(p: LabPanel, sortOrder: number) {
  const spec: LabPanelSpec = { sections: p.sections ?? [{ tests: p.tests }] };
  if (p.code) spec.code = p.code;
  if (p.specimen) spec.specimen = p.specimen;
  if (p.layout) spec.layout = p.layout;
  if (p.aliases) spec.aliases = p.aliases;
  return { key: p.id, name: p.name, department: p.department, sortOrder, spec };
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const strList = (v: unknown, max = 200) => (Array.isArray(v) && v.length <= max && v.every((x) => isStr(x) && x.length <= 120) ? (v as string[]) : undefined);
const asObject = (v: unknown): Record<string, unknown> => {
  if (isStr(v)) {
    try {
      return asObject(JSON.parse(v));
    } catch {
      return {};
    }
  }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
};
const cleanRange = (v: unknown): LabRange | undefined => {
  const o = asObject(v);
  const r: LabRange = {};
  if (isNum(o.low)) r.low = o.low;
  if (isNum(o.high)) r.high = o.high;
  return r.low !== undefined || r.high !== undefined ? r : undefined;
};

/** A test's spec as stored, keeping only well-formed fields (a clinic writes these; they reach print and flags). */
export function cleanLabTestSpec(v: unknown): LabTestSpec {
  const o = asObject(v);
  const s: LabTestSpec = {};
  for (const k of ["options", "normal", "antibiotics", "aliases"] as const) {
    const l = strList(o[k]);
    if (l) s[k] = l;
  }
  for (const k of ["refText", "titreSignificant", "method"] as const) if (isStr(o[k]) && o[k].length <= 200) s[k] = o[k];
  for (const k of ["perCmmFrom", "decimals"] as const) if (isNum(o[k])) s[k] = o[k];
  if (o.printAs === "per_cmm") s.printAs = "per_cmm";
  if (o.allowRange === true) s.allowRange = true;
  if (o.range !== undefined) {
    const r = asObject(o.range);
    const range: NonNullable<LabTest["range"]> = { ...cleanRange(r) };
    const male = cleanRange(r.male), female = cleanRange(r.female);
    if (male) range.male = male;
    if (female) range.female = female;
    if (Array.isArray(r.bands)) {
      const bands = r.bands.slice(0, 20).map((b): LabRangeBand | null => {
        const x = asObject(b);
        const band: LabRangeBand = { ...cleanRange(x) };
        if (x.sex === "male" || x.sex === "female") band.sex = x.sex;
        if (isNum(x.minAgeDays)) band.minAgeDays = x.minAgeDays;
        if (isNum(x.maxAgeDays)) band.maxAgeDays = x.maxAgeDays;
        return band.low !== undefined || band.high !== undefined ? band : null;
      }).filter((b): b is LabRangeBand => b !== null);
      if (bands.length) range.bands = bands;
    }
    if (Object.keys(range).length) s.range = range;
  }
  return s;
}

export function cleanLabPanelSpec(v: unknown): LabPanelSpec {
  const o = asObject(v);
  const s: LabPanelSpec = {};
  if (isStr(o.code) && o.code.length <= 40) s.code = o.code;
  if (isStr(o.specimen) && o.specimen.length <= 60) s.specimen = o.specimen;
  if (o.layout === "table" || o.layout === "culture") s.layout = o.layout;
  const aliases = strList(o.aliases);
  if (aliases) s.aliases = aliases;
  if (Array.isArray(o.sections)) {
    s.sections = o.sections.slice(0, 20).map((x) => {
      const sec = asObject(x);
      return { ...(isStr(sec.title) && sec.title.length <= 60 ? { title: sec.title } : {}), tests: strList(sec.tests, 60) ?? [] };
    });
  }
  return s;
}

/**
 * Checks a clinic's lab_test / lab_panel row (snake_case, as uploaded) before it's written; the settings screen
 * runs the same check. Returns the problem, or null. Only the fields present are checked.
 */
export function labCatalogueRowProblem(table: "lab_test" | "lab_panel", r: Record<string, unknown>): string | null {
  const id = table === "lab_test" ? "code" : "key";
  const str = (k: string, max: number) => (r[k] === undefined || r[k] === null ? null : !isStr(r[k]) ? `${k} must be text` : r[k].length > max ? `${k} is too long (max ${max})` : null);
  if (r[id] !== undefined && (!isStr(r[id]) || !/^[A-Za-z0-9][A-Za-z0-9.:\-]{0,39}$/.test(r[id]))) return `invalid ${id}`;
  const problem = str("name", 120) ?? str("short", 60) ?? str("unit", 30);
  if (problem) return problem;
  if (r.kind !== undefined && r.kind !== null && !TEST_KINDS.includes(r.kind as LabTestKind)) return "invalid kind";
  if (r.department !== undefined && r.department !== null && !isLabDepartment(r.department)) return "invalid department";
  if (r.spec !== undefined && r.spec !== null) {
    const raw = isStr(r.spec) ? r.spec : JSON.stringify(r.spec);
    if (raw.length > 20_000) return "spec is too large";
    let spec: unknown;
    try {
      spec = JSON.parse(raw);
    } catch {
      return "spec must be an object";
    }
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) return "spec must be an object";
  }
  return null;
}

/** Field by field, a clinic's non-null value wins; specs merge key by key. */
function overlay<R extends { spec?: unknown; isActive?: boolean | null }>(base: R | undefined, top: R | undefined): R {
  if (!base) return top!;
  if (!top) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(top)) if (v !== null && v !== undefined && k !== "spec") out[k] = v;
  out.spec = { ...asObject(base.spec), ...asObject(top.spec) };
  out.isActive = top.isActive ?? true;
  return out as R;
}

const bySortOrder = <R extends { sortOrder?: number | null }>(a: R, b: R) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9);

/**
 * The catalogue a clinic uses: the platform rows with the clinic's rows laid over them. A clinic row with a platform
 * code changes that test (or hides it, with isActive false); one with a new code adds the clinic's own test.
 * Malformed rows are skipped.
 */
export function buildLabCatalogue(rows: { tests: LabTestRow[]; panels: LabPanelRow[] }): LabCatalogue {
  const merge = <R extends { tenantId?: string | null; isActive?: boolean | null; spec?: unknown; sortOrder?: number | null }>(list: R[], key: (r: R) => string) => {
    const platform = new Map<string, R>(), clinic = new Map<string, R>();
    for (const r of list) {
      if (r.tenantId) clinic.set(key(r), r);
      else if (r.isActive !== false) platform.set(key(r), r);
    }
    const merged = [...new Set([...platform.keys(), ...clinic.keys()])].map((k) => overlay(platform.get(k), clinic.get(k)));
    return merged.sort(bySortOrder);
  };
  const hidden: string[] = [];
  const tests: LabTest[] = [];
  for (const r of merge(rows.tests, (r) => r.code)) {
    if (!r.name || !r.short || !TEST_KINDS.includes(r.kind as LabTestKind)) continue;
    tests.push({
      code: r.code, name: r.name, short: r.short, unit: r.unit ?? "", kind: r.kind as LabTestKind,
      department: isLabDepartment(r.department) ? r.department : "biochemistry", ...cleanLabTestSpec(r.spec),
    });
    if (r.isActive === false) hidden.push(r.code);
  }
  const panels: LabPanel[] = [];
  for (const r of merge(rows.panels, (r) => r.key)) {
    if (!r.name || r.isActive === false) continue;
    const spec = cleanLabPanelSpec(r.spec);
    const { sections, ...rest } = spec;
    panels.push({
      id: r.key, name: r.name, department: isLabDepartment(r.department) ? r.department : "biochemistry",
      tests: (sections ?? []).flatMap((s) => s.tests), ...(sections && sections.some((s) => s.title) ? { sections } : {}), ...rest,
    });
  }
  return makeLabCatalogue(tests, panels, hidden);
}

// ---------------------------------------------------------------------------
// A clinic's changes, as rows
// ---------------------------------------------------------------------------

/** Four 32-bit hashes of a string (cyrb128): enough to name a row, not a security measure. */
function hash128(s: string): number[] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < s.length; i++) {
    const k = s.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  return [h1 >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

/**
 * The id of a clinic's row for a test code or panel key. It is derived, so two devices that change the same test
 * offline write the same row (the later upload wins) instead of two rows the server would refuse.
 */
export function labRowId(tenantId: string, table: "lab_test" | "lab_panel", code: string): string {
  return derivedUuid(`${table}:${tenantId}:${code}`);
}

/** A uuid-shaped id derived from a key: the same key always gives the same id, on any device. */
export function derivedUuid(key: string): string {
  const hex = hash128(key).map((n) => n.toString(16).padStart(8, "0")).join("");
  const variant = ((parseInt(hex[16]!, 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20)}`;
}

/** A clinic's own test code: "x-" and its name, numbered when taken. "x-" keeps it clear of platform codes. */
export function customLabCode(name: string, taken: (code: string) => boolean): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "") || "test";
  let code = `x-${slug}`;
  for (let n = 2; taken(code); n++) code = `x-${slug}-${n}`;
  return code;
}

/** What a clinic changes on a test from its settings. */
export type LabTestEdit = Pick<LabTest, "name" | "short" | "unit" | "range" | "refText" | "options" | "normal">;
const EDITABLE_SPEC = ["range", "refText", "options", "normal"] as const;

/** JSON with sorted keys, to compare values built in different orders. */
const canon = (v: unknown): string =>
  v && typeof v === "object" && !Array.isArray(v)
    ? `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`
    : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : JSON.stringify(v ?? null);

/**
 * The clinic row's columns after an edit of a platform test: only what differs from the platform's test. A null
 * column, or a spec key left out, keeps following the platform's (and its later corrections). Spec keys replace
 * whole, so a range is written with its sex and age parts. An empty refText prints the range instead of the
 * platform's text. For the clinic's own test (no platform test) every field is written.
 */
export function labTestOverride(
  platform: LabTest | undefined,
  clinicSpec: unknown,
  edit: LabTestEdit & Pick<LabTest, "kind" | "department">,
): { name: string | null; short: string | null; unit: string | null; kind: string | null; department: string | null; spec: LabTestSpec } {
  const spec = cleanLabTestSpec(clinicSpec) as Record<string, unknown>;
  for (const k of EDITABLE_SPEC) {
    const v = edit[k];
    const set = Array.isArray(v) ? v.length > 0 : k === "range" ? Boolean(cleanLabTestSpec({ range: v }).range) : Boolean(v);
    if (platform && canon(set ? v : undefined) === canon(platform[k])) delete spec[k];
    else if (set) spec[k] = v;
    else if (k === "refText" && platform?.refText) spec[k] = "";
    else delete spec[k];
  }
  const clean = cleanLabTestSpec(spec);
  if (!platform) return { name: edit.name, short: edit.short, unit: edit.unit, kind: edit.kind, department: edit.department, spec: clean };
  const diff = (k: "name" | "short" | "unit") => ((edit[k] ?? "") === (platform[k] ?? "") ? null : edit[k]);
  return { name: diff("name"), short: diff("short"), unit: diff("unit"), kind: null, department: null, spec: clean };
}

// ---------------------------------------------------------------------------
// Ranges, flags, results
// ---------------------------------------------------------------------------

/** Whose result it is: the sex, or the sex and age (in days) when age bands matter. */
export type LabWho = Sex | null | undefined | { sex?: Sex | null; ageDays?: number | null };
const whoOf = (w: LabWho) => (w && typeof w === "object" ? w : { sex: w });

function bandFor(test: LabTest, who: LabWho): LabRangeBand | undefined {
  const { sex, ageDays } = whoOf(who);
  return test.range?.bands?.find((b) => {
    if (b.sex && b.sex !== sex) return false;
    const aged = b.minAgeDays !== undefined || b.maxAgeDays !== undefined;
    if (!aged) return Boolean(b.sex);
    if (ageDays === undefined || ageDays === null) return false;
    return (b.minAgeDays === undefined || ageDays >= b.minAgeDays) && (b.maxAgeDays === undefined || ageDays < b.maxAgeDays);
  });
}

/** The range a result is judged against: the lab's own, else the catalogue's for the patient's age and sex. */
export function labRange(test: LabTest, who: LabWho, result?: Pick<LabResult, "low" | "high">): LabRange {
  if (result && (result.low !== undefined || result.high !== undefined)) return { low: result.low, high: result.high };
  const r = test.range;
  if (!r) return {};
  const band = bandFor(test, who);
  if (band) return { low: band.low, high: band.high };
  const { sex } = whoOf(who);
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

const rangeText = ({ low, high }: LabRange) =>
  low !== undefined && high !== undefined ? `${low}–${high}` : low !== undefined ? `>${low}` : high !== undefined ? `<${high}` : "";

/** The reference range as printed: "13–17", "<200", "M: 13–17, F: 12–15", "Nil", "<1:160". */
export function labRefText(test: LabTest, who: LabWho, result?: Pick<LabResult, "low" | "high">): string {
  if (result && (result.low !== undefined || result.high !== undefined)) return rangeText(result);
  if (test.refText) return test.refText;
  switch (test.kind) {
    case "numeric": {
      const r = test.range;
      if (!r) return "";
      const { sex } = whoOf(who);
      if (!bandFor(test, who) && r.male && r.female && sex !== "male" && sex !== "female") return `M: ${rangeText(r.male)}, F: ${rangeText(r.female)}`;
      return rangeText(labRange(test, who));
    }
    case "coded":
    case "text":
      return (test.normal ?? []).join(" / ");
    case "titre":
      return test.titreSignificant ? `<${test.titreSignificant}` : "";
    default:
      return "";
  }
}

/** A count typed per cmm (WBC 11800) in the test's ×10³/µL unit (11.8). */
export function normaliseLabValue(test: LabTest, value: number): number {
  return test.perCmmFrom !== undefined && value >= test.perCmmFrom ? Math.round((value / 1000) * 100) / 100 : value;
}

const MANY = /^(plenty|numerous|full field|packed|loaded|many)\b/i;

/** A microscopy count as written: "3" → 3, "2-4" → judged on 4, "Nil" → 0, "Plenty" → high. */
export function parseLabCount(text: string): { value?: number; text?: string; many?: boolean } {
  const t = text.trim();
  if (/^\d+(?:\.\d+)?$/.test(t)) return { value: Number(t) };
  const range = /^(\d+)\s*[-–]\s*(\d+)$/.exec(t);
  if (range) return { value: Number(range[2]), text: `${range[1]}-${range[2]}` };
  if (/^(nil|absent|not found)$/i.test(t)) return { value: 0, text: "Nil" };
  return { text: t, many: MANY.test(t) };
}

/** H/L for numbers outside the range; A for an abnormal coded/text result, a significant titre or a growth. */
export function labFlag(test: LabTest, result: Pick<LabResult, "value" | "text" | "low" | "high" | "culture">, who: LabWho): LabFlag | undefined {
  switch (test.kind) {
    case "coded":
    case "text": {
      if (!result.text || !test.normal) return undefined;
      const t = result.text.trim().toLowerCase();
      return test.normal.some((n) => n.toLowerCase() === t) ? undefined : "A";
    }
    case "titre": {
      const at = (x?: string) => (x ? (test.options ?? []).indexOf(x) : -1);
      const i = at(result.text), sig = at(test.titreSignificant);
      return i >= 0 && sig >= 0 && i >= sig ? "A" : undefined;
    }
    case "culture":
      return result.culture?.growth ? "A" : undefined;
    default: {
      if (result.value === undefined || !Number.isFinite(result.value)) return undefined;
      const { low, high } = labRange(test, who, result);
      if (low !== undefined && result.value < low) return "L";
      if (high !== undefined && result.value > high) return "H";
      return undefined;
    }
  }
}

export interface LabInput {
  value?: number;
  text?: string;
  low?: number;
  high?: number;
  print?: boolean;
  section?: string;
  culture?: LabCultureResult;
}

/**
 * A result as entered → stored: normalised value, the flag, printing on for abnormal values, and the test's
 * name and reference range as of now.
 */
export function labResult(test: LabTest, input: LabInput, who: LabWho): LabResult {
  let value = input.value !== undefined && Number.isFinite(input.value) ? normaliseLabValue(test, input.value) : undefined;
  let text = input.text?.trim() || undefined;
  let many = false;
  if (test.kind === "numeric" && test.allowRange && text) {
    const c = parseLabCount(text);
    value = c.value ?? value;
    text = c.text;
    many = Boolean(c.many);
  }
  const r: LabResult = { code: test.code, unit: test.unit, print: false, name: test.short };
  if (value !== undefined) r.value = value;
  if (text) r.text = text;
  if (input.low !== undefined) r.low = input.low;
  if (input.high !== undefined) r.high = input.high;
  if (test.kind === "culture" && input.culture) r.culture = input.culture;
  const flag = many ? "H" : labFlag(test, r, who);
  if (flag) r.flag = flag;
  const ref = labRefText(test, who, r);
  if (ref) r.ref = ref;
  if (input.section) r.section = input.section;
  r.print = input.print ?? flag !== undefined;
  return r;
}

const num = (n: number) => String(Math.round(n * 100) / 100);

/** "No growth", or "E. coli 10⁵ CFU/mL (S: Nitrofurantoin; R: Ciprofloxacin)". */
export function labCultureText(c: LabCultureResult): string {
  if (!c.growth || !c.organisms.length) return "No growth";
  return c.organisms
    .map((o) => {
      const by = (sir: string) => o.sensitivity.filter((s) => s.sir === sir).map((s) => s.drug);
      const sens = [["S", by("S")], ["I", by("I")], ["R", by("R")]].filter(([, d]) => d!.length).map(([k, d]) => `${k}: ${(d as string[]).join(", ")}`);
      return `${o.name}${o.count ? ` ${o.count}` : ""}${sens.length ? ` (${sens.join("; ")})` : ""}`;
    })
    .join("; ");
}

/** "Hb 9.2 g/dL (L)", "HBsAg Positive", "Pus cells 8-10 /HPF (H)". */
export function labValueText(r: LabResult, cat: LabCatalogue = DEFAULT_LAB_CATALOGUE): string {
  const name = r.name ?? cat.byCode[r.code]?.short ?? r.code;
  if (r.culture) return `${name}: ${labCultureText(r.culture)}`;
  const shown = r.text ?? (r.value !== undefined ? num(r.value) : "");
  const unit = r.value !== undefined && r.unit ? ` ${r.unit}` : "";
  const flag = r.flag === "H" || r.flag === "L" ? ` (${r.flag})` : "";
  return `${name} ${shown}${unit}${flag}`.replace(/\s+/g, " ").trim();
}

/**
 * One printed line per report, e.g. "CBC (12/10/26): Hb 9.2 g/dL (L), WBC 11.8 ×10³/µL (H)".
 * With `onlyPrinted`, only ticked values (and the conclusion) appear; a report with nothing to print gives null.
 */
export function labLine(report: LabReport, opts: { onlyPrinted: boolean }, cat: LabCatalogue = DEFAULT_LAB_CATALOGUE): { title: string; date: string; text: string } | null {
  const values = report.results.filter((r) => !opts.onlyPrinted || r.print).map((r) => labValueText(r, cat));
  const parts = [...values, ...(report.conclusion?.trim() ? [report.conclusion.trim()] : [])];
  if (!parts.length) return null;
  const date = report.reportDate;
  return { title: report.title, date, text: `${report.title} (${formatDateDmy(date, "en", "/").replace(/\/(\d{2})(\d{2})$/, "/$2")}): ${parts.join(", ")}` };
}

export const LAB_LIMITS = {
  results: 60, text: 200, title: 120, labName: 120, conclusion: 2000, files: 10,
  name: 60, ref: 120, section: 60, organisms: 3, sensitivity: 40, organism: 120, count: 40, drug: 60,
  specimen: 60, referredBy: 120, comment: 2000,
} as const;

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

function cultureProblem(c: unknown): string | null {
  const o = c as Record<string, unknown>;
  if (!o || typeof o !== "object" || typeof o.growth !== "boolean" || !Array.isArray(o.organisms)) return "invalid culture result";
  if (o.organisms.length > LAB_LIMITS.organisms) return `too many organisms (max ${LAB_LIMITS.organisms})`;
  for (const org of o.organisms as Record<string, unknown>[]) {
    if (!org || !isStr(org.name) || !org.name || org.name.length > LAB_LIMITS.organism) return "invalid organism";
    if (org.count !== undefined && (!isStr(org.count) || org.count.length > LAB_LIMITS.count)) return "invalid colony count";
    if (!Array.isArray(org.sensitivity) || org.sensitivity.length > LAB_LIMITS.sensitivity) return "invalid sensitivity table";
    for (const s of org.sensitivity as Record<string, unknown>[]) {
      if (!s || !isStr(s.drug) || !s.drug || s.drug.length > LAB_LIMITS.drug) return "invalid antibiotic";
      if (s.sir !== "S" && s.sir !== "I" && s.sir !== "R") return "sensitivity must be S, I or R";
      if (s.zone !== undefined && (!isStr(s.zone) || s.zone.length > 20)) return "invalid zone size";
    }
  }
  return null;
}

/** The fields of a lab report that labReportProblem checks (whichever are present). */
export interface LabReportFields {
  results?: unknown;
  title?: unknown;
  labName?: unknown;
  conclusion?: unknown;
  reportDate?: unknown;
  files?: unknown;
  source?: unknown;
  requestId?: unknown;
  specimen?: unknown;
  collectedAt?: unknown;
  referredBy?: unknown;
  comment?: unknown;
  department?: unknown;
}

/**
 * Checks a lab report before it's saved. The client runs it before writing and the upload endpoint runs it
 * again, so a report the user saw saved is never rejected later. Returns the problem, or null.
 * Only the fields present are checked (an upload may change a few of them). Test codes aren't looked up: a
 * clinic's own test may reach the server after a report that uses it.
 */
export function labReportProblem(r: LabReportFields, today: string): string | null {
  const str = (v: unknown, max: number, what: string) =>
    v === undefined || v === null ? null : typeof v !== "string" ? `${what} must be text` : v.length > max ? `${what} is too long (max ${max})` : null;
  const problem =
    str(r.title, LAB_LIMITS.title, "title") ?? str(r.labName, LAB_LIMITS.labName, "lab name") ?? str(r.conclusion, LAB_LIMITS.conclusion, "conclusion") ??
    str(r.specimen, LAB_LIMITS.specimen, "specimen") ?? str(r.referredBy, LAB_LIMITS.referredBy, "referred by") ?? str(r.comment, LAB_LIMITS.comment, "comment");
  if (problem) return problem;
  if (r.source !== undefined && r.source !== null && r.source !== "external" && r.source !== "in_house") return "invalid report source";
  if (r.requestId !== undefined && r.requestId !== null && (!isStr(r.requestId) || !UUID_RE.test(r.requestId))) return "invalid request id";
  if (r.department !== undefined && r.department !== null && !isLabDepartment(r.department)) return "invalid department";
  if (r.reportDate !== undefined && r.reportDate !== null) {
    if (typeof r.reportDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.reportDate)) return "report date must be YYYY-MM-DD";
    if (r.reportDate > today) return "report date is in the future";
  }
  if (r.collectedAt !== undefined && r.collectedAt !== null) {
    if (!isStr(r.collectedAt) || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(r.collectedAt) || Number.isNaN(Date.parse(r.collectedAt))) return "invalid collection time";
    if (r.collectedAt.slice(0, 10) > today) return "collection time is in the future";
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
    const s = str(x.name, LAB_LIMITS.name, "result name") ?? str(x.ref, LAB_LIMITS.ref, "reference range") ?? str(x.section, LAB_LIMITS.section, "section");
    if (s) return s;
    if (x.culture !== undefined) {
      const c = cultureProblem(x.culture);
      if (c) return c;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Quick entry, ordered tests, trends
// ---------------------------------------------------------------------------

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
 * Quick entry: "hb 9.2 wbc 11800 rbs 11.4 hbsag neg pus 2-4" → results by test code.
 * Name and value may be joined ("hb9.2") or separated by ":", "=" or ",".
 */
export function parseLabShorthand(input: string, cat: LabCatalogue = DEFAULT_LAB_CATALOGUE): ShorthandResult {
  const tokens = input
    .split(/[\s,;:=]+/)
    .filter(Boolean)
    .flatMap((t) => {
      const m = /^([a-z][a-z0-9%]*?)(\d+(?:\.\d+)?)$/i.exec(t);
      return m && cat.aliasToCode[norm(m[1]!)] ? [m[1]!, m[2]!] : [t];
    });
  const out: ShorthandResult = { results: [], unknown: [] };
  let name: string[] = [];
  for (const tok of tokens) {
    const n = /^\d+(?:\.\d+)?$/.test(tok) ? Number(tok) : undefined;
    const count = /^\d+[-–]\d+$/.test(tok) ? tok : undefined;
    const word = CODED_WORDS[tok.toLowerCase()];
    if (n === undefined && count === undefined && word === undefined) {
      name.push(tok);
      continue;
    }
    const label = name.join(" ");
    name = [];
    const code = cat.aliasToCode[norm(label)];
    const test = code ? cat.byCode[code] : undefined;
    if (!label || !test) {
      out.unknown.push(`${label} ${tok}`.trim());
      continue;
    }
    if (test.kind === "coded") {
      if (word && test.options?.includes(word)) out.results.push({ code: test.code, text: word });
      else out.unknown.push(`${label} ${tok}`);
    } else if (test.kind === "numeric" && n !== undefined) out.results.push({ code: test.code, value: n });
    else if (test.kind === "numeric" && count !== undefined && test.allowRange) out.results.push({ code: test.code, text: count });
    else out.unknown.push(`${label} ${tok}`);
  }
  if (name.length) out.unknown.push(name.join(" "));
  return out;
}

/** The panel a test belongs to (the first one listing it). */
export function panelOfTest(code: string, cat: LabCatalogue = DEFAULT_LAB_CATALOGUE): LabPanel | undefined {
  return cat.panels.find((p) => p.tests.includes(code));
}

const ORDERED_PANELS: [RegExp, string][] = [
  [/urine\s*r\/?m?\/?e|urine routine/i, "urine"],
  [/stool\s*r\/?m?\/?e|stool routine/i, "stool"],
  [/\bcbc\b|hb%|haemoglobin|hemoglobin|platelet|eosinophil|\besr\b/i, "cbc"],
  [/\brbs\b|\bfbs\b|2habf|hba1c|blood sugar|glucose/i, "sugar"],
  [/creatinine|\burea\b|uric acid|egfr|\brft\b|renal function/i, "rft"],
  [/sgpt|sgot|\balt\b|\bast\b|bilirubin|\blft\b|liver function/i, "lft"],
  [/lipid|cholesterol|triglycer/i, "lipid"],
  [/\btsh\b|\bft4\b|thyroid/i, "thyroid"],
  [/electrolyte/i, "electrolytes"],
  [/hbsag|\bhcv\b|\bcrp\b/i, "serology"],
  [/widal/i, "widal"],
  [/dengue|\bns1\b/i, "dengue"],
  [/blood group|grouping/i, "grouping"],
];

/**
 * Where to record the result of an ordered investigation: a panel, or a free-text report titled with its name
 * (imaging, ECG…).
 */
export function panelForInvestigation(name: string, cat: LabCatalogue = DEFAULT_LAB_CATALOGUE): { panel: string; title?: string } {
  const usable = (id: string | undefined) => (id ? cat.panelById[id] : undefined);
  const hit = usable(ORDERED_PANELS.find(([re]) => re.test(name))?.[1]);
  if (hit) return { panel: hit.id };
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const names = (p: LabPanel) => [p.name, ...(p.aliases ?? [])].map((a) => a.toLowerCase().replace(/[^a-z0-9]/g, "")).filter((a) => a.length >= 4);
  const match = cat.panels.find((p) => names(p).includes(key)) ?? cat.panels.find((p) => names(p).some((a) => key.includes(a)));
  return usable(match?.id) ? { panel: match!.id } : { panel: OTHER_PANEL, title: name };
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
