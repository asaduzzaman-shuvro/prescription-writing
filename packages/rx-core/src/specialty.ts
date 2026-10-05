/**
 * Specialty examination templates (ENT first). An admin-defined schema describes the fields; the
 * encounter stores answers keyed by field id; `flattenFindings` turns answers into printable lines
 * and small vector diagrams for the prescription.
 */
import type { ExamFindingLine } from "./types";

export type FieldType = "select" | "multiselect" | "text" | "number" | "eardrum" | "audiogram";

export interface TemplateField {
  id: string;
  label: string;
  type: FieldType;
  options?: string[];
  /** Separate right/left answers (ears, nostrils, tonsils). */
  lateral?: boolean;
  unit?: string;
  /** Option printed as "normal" is omitted from print to keep the pad short. */
  normal?: string;
}

export interface TemplateSection {
  id: string;
  title: string;
  fields: TemplateField[];
}

export interface SpecialtyTemplateSchema {
  sections: TemplateSection[];
  /** How right/left/both answers are printed. Default R / L / B/L (ENT); eyes use RE / LE / B/E. */
  lateralLabels?: { right: string; left: string; both: string };
}

const DEFAULT_LATERAL = { right: "R", left: "L", both: "B/L" };

export type Side2 = "right" | "left";
export type LateralValue<T> = Partial<Record<Side2, T>>;

/** Eardrum quadrants: AS, AI, PS, PI plus pars flaccida (attic). */
export const EARDRUM_ZONES = ["attic", "as", "ai", "ps", "pi"] as const;
export type EardrumZone = (typeof EARDRUM_ZONES)[number];
export interface EardrumValue {
  perforation: EardrumZone[];
  retraction: EardrumZone[];
}

export const AUDIO_FREQS = [250, 500, 1000, 2000, 4000, 8000] as const;
/** dB HL thresholds keyed by frequency, for air (ac) and bone (bc) conduction. */
export interface AudiogramEar {
  ac: Partial<Record<(typeof AUDIO_FREQS)[number], number>>;
  bc: Partial<Record<(typeof AUDIO_FREQS)[number], number>>;
}
export type AudiogramValue = LateralValue<AudiogramEar>;

export type Findings = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const FIELD_TYPES: FieldType[] = ["select", "multiselect", "text", "number", "eardrum", "audiogram"];

/** Validate an admin-edited template JSON. Returns a list of problems (empty = valid). */
export function validateTemplateSchema(raw: unknown): string[] {
  const errors: string[] = [];
  const t = raw as SpecialtyTemplateSchema;
  if (!t || !Array.isArray(t.sections)) return ["root must be { sections: [...] }"];
  if (t.lateralLabels !== undefined) {
    const l = t.lateralLabels;
    if (!l || typeof l.right !== "string" || typeof l.left !== "string" || typeof l.both !== "string" || !l.right || !l.left || !l.both)
      errors.push(`lateralLabels must be { "right": "…", "left": "…", "both": "…" }`);
  }
  const ids = new Set<string>();
  t.sections.forEach((s, si) => {
    if (!s.id || !s.title) errors.push(`section ${si + 1}: id and title are required`);
    if (!Array.isArray(s.fields)) return errors.push(`section ${s.id}: fields must be an array`);
    s.fields.forEach((f) => {
      if (!f.id || !f.label) errors.push(`section ${s.id}: every field needs id and label`);
      if (ids.has(f.id)) errors.push(`duplicate field id "${f.id}"`);
      ids.add(f.id);
      if (!FIELD_TYPES.includes(f.type)) errors.push(`field ${f.id}: unknown type "${f.type}"`);
      if ((f.type === "select" || f.type === "multiselect") && (!Array.isArray(f.options) || !f.options.length))
        errors.push(`field ${f.id}: options required for ${f.type}`);
    });
  });
  return errors;
}

// ---------------------------------------------------------------------------
// Audiology helpers
// ---------------------------------------------------------------------------

/** Four-frequency pure-tone average (500, 1000, 2000, 4000 Hz) of air conduction. */
export function ptaAverage(ear: AudiogramEar | undefined): number | null {
  if (!ear) return null;
  const vals = [500, 1000, 2000, 4000].map((f) => ear.ac[f as 500]);
  if (vals.some((v) => v === undefined || Number.isNaN(v))) return null;
  return Math.round(((vals as number[]).reduce((a, b) => a + b, 0) / 4) * 10) / 10;
}

/** WHO 2021 grades of hearing loss by better-ear PTA, applied per ear here. */
export function hearingGrade(pta: number | null): string | null {
  if (pta === null) return null;
  if (pta < 20) return "Normal";
  if (pta < 35) return "Mild";
  if (pta < 50) return "Moderate";
  if (pta < 65) return "Moderately severe";
  if (pta < 80) return "Severe";
  if (pta < 95) return "Profound";
  return "Complete";
}

/** Mean air–bone gap over 500–2000 Hz; > 10 dB suggests a conductive component. */
export function airBoneGap(ear: AudiogramEar | undefined): number | null {
  if (!ear) return null;
  const gaps = [500, 1000, 2000]
    .map((f) => (ear.ac[f as 500] !== undefined && ear.bc[f as 500] !== undefined ? ear.ac[f as 500]! - ear.bc[f as 500]! : null))
    .filter((g): g is number => g !== null);
  if (!gaps.length) return null;
  return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
}

// ---------------------------------------------------------------------------
// SVG diagrams (generated from numbers only, so safe to embed in print)
// ---------------------------------------------------------------------------

/** Zone polygons on a 100×100 eardrum (right ear orientation; left is mirrored). */
const ZONE_PATHS: Record<EardrumZone, string> = {
  attic: "M38,14 A38,38 0 0 1 62,14 L56,26 L44,26 Z",
  as: "M50,50 L44,26 L38,14 A38,38 0 0 0 12,50 Z",
  ai: "M50,50 L12,50 A38,38 0 0 0 50,88 Z",
  ps: "M50,50 L88,50 A38,38 0 0 0 62,14 L56,26 Z",
  pi: "M50,50 L50,88 A38,38 0 0 0 88,50 Z",
};

export function eardrumZonePath(zone: EardrumZone): string {
  return ZONE_PATHS[zone];
}

export function eardrumSvg(value: EardrumValue | undefined, side: Side2): string {
  const v = value ?? { perforation: [], retraction: [] };
  const mirror = side === "left" ? ` transform="translate(100,0) scale(-1,1)"` : "";
  const zones = EARDRUM_ZONES.map((z) => {
    const fill = v.perforation.includes(z) ? "#111" : v.retraction.includes(z) ? "url(#hatch)" : "none";
    return `<path d="${ZONE_PATHS[z]}" fill="${fill}" stroke="#555" stroke-width="0.8"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 108"><defs><pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="#333" stroke-width="1"/></pattern></defs><g${mirror}><circle cx="50" cy="50" r="38" fill="none" stroke="#111" stroke-width="1.5"/>${zones}<line x1="50" y1="26" x2="54" y2="56" stroke="#111" stroke-width="2"/></g><text x="50" y="106" font-size="9" text-anchor="middle" font-family="sans-serif">${side === "right" ? "R" : "L"}</text></svg>`;
}

/** Standard audiogram: frequency on x (log), dB HL on y (−10 top to 120 bottom). */
export function audiogramSvg(value: AudiogramValue | undefined): string {
  const W = 220, H = 170, L = 26, T = 10, PW = 186, PH = 140;
  const x = (i: number) => L + (i / (AUDIO_FREQS.length - 1)) * PW;
  const y = (db: number) => T + ((db + 10) / 130) * PH;
  let g = "";
  for (let db = -10; db <= 120; db += 10) g += `<line x1="${L}" y1="${y(db)}" x2="${L + PW}" y2="${y(db)}" stroke="#ddd" stroke-width="0.5"/><text x="${L - 3}" y="${y(db) + 3}" font-size="6" text-anchor="end">${db}</text>`;
  AUDIO_FREQS.forEach((f, i) => (g += `<line x1="${x(i)}" y1="${T}" x2="${x(i)}" y2="${T + PH}" stroke="#ddd" stroke-width="0.5"/><text x="${x(i)}" y="${T + PH + 9}" font-size="6" text-anchor="middle">${f >= 1000 ? `${f / 1000}k` : f}</text>`));
  const series = (ear: AudiogramEar | undefined, kind: "ac" | "bc", side: Side2) => {
    if (!ear) return "";
    const color = side === "right" ? "#c00" : "#00c";
    const pts = AUDIO_FREQS.map((f, i) => (ear[kind][f] === undefined ? null : [x(i), y(ear[kind][f]!)] as const)).filter((p): p is readonly [number, number] => p !== null);
    const line = kind === "ac" && pts.length > 1 ? `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${color}" stroke-width="1"/>` : "";
    const marks = pts
      .map(([px, py]) =>
        kind === "ac"
          ? side === "right"
            ? `<circle cx="${px}" cy="${py}" r="3" fill="none" stroke="${color}" stroke-width="1.2"/>`
            : `<path d="M${px - 3},${py - 3} L${px + 3},${py + 3} M${px + 3},${py - 3} L${px - 3},${py + 3}" stroke="${color}" stroke-width="1.2"/>`
          : side === "right"
            ? `<path d="M${px - 1},${py - 4} L${px - 5},${py} L${px - 1},${py + 4}" fill="none" stroke="${color}" stroke-width="1.2"/>`
            : `<path d="M${px + 1},${py - 4} L${px + 5},${py} L${px + 1},${py + 4}" fill="none" stroke="${color}" stroke-width="1.2"/>`,
      )
      .join("");
    return line + marks;
  };
  const v = value ?? {};
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif">${g}<rect x="${L}" y="${T}" width="${PW}" height="${PH}" fill="none" stroke="#111" stroke-width="0.8"/>${series(v.right, "ac", "right")}${series(v.left, "ac", "left")}${series(v.right, "bc", "right")}${series(v.left, "bc", "left")}</svg>`;
}

// ---------------------------------------------------------------------------
// Flatten for print
// ---------------------------------------------------------------------------

function text(v: unknown, f: TemplateField): string {
  if (v === undefined || v === null || v === "") return "";
  if (Array.isArray(v)) return v.filter((x) => x !== f.normal).join(", ");
  const s = String(v);
  if (f.normal && s === f.normal) return "";
  return f.unit ? `${s} ${f.unit}` : s;
}

const ZONE_LABEL: Record<EardrumZone, string> = { attic: "attic", as: "AS", ai: "AI", ps: "PS", pi: "PI" };

function eardrumText(v: EardrumValue | undefined): string {
  if (!v) return "";
  const parts: string[] = [];
  if (v.perforation?.length) parts.push(`perforation ${v.perforation.map((z) => ZONE_LABEL[z]).join("+")}`);
  if (v.retraction?.length) parts.push(`retraction ${v.retraction.map((z) => ZONE_LABEL[z]).join("+")}`);
  return parts.join("; ");
}

function audiogramText(v: AudiogramValue | undefined): string {
  if (!v) return "";
  return (["right", "left"] as const)
    .map((side) => {
      const pta = ptaAverage(v[side]);
      if (pta === null) return "";
      const gap = airBoneGap(v[side]);
      return `${side === "right" ? "R" : "L"} ${pta} dB (${hearingGrade(pta)}${gap !== null && gap > 10 ? `, A-B gap ${gap} dB` : ""})`;
    })
    .filter(Boolean)
    .join("; ");
}

export interface FlattenedExam {
  groups: { title: string; lines: ExamFindingLine[] }[];
  diagrams: { title: string; svg: string }[];
}

export function flattenFindings(schema: SpecialtyTemplateSchema, findings: Findings): FlattenedExam {
  const groups: FlattenedExam["groups"] = [];
  const diagrams: FlattenedExam["diagrams"] = [];
  const side = schema.lateralLabels ?? DEFAULT_LATERAL;
  for (const section of schema.sections) {
    const lines: ExamFindingLine[] = [];
    for (const f of section.fields) {
      const v = findings[f.id];
      if (v === undefined) continue;
      if (f.type === "eardrum") {
        const lv = v as LateralValue<EardrumValue>;
        const r = eardrumText(lv.right), l = eardrumText(lv.left);
        if (r || l) {
          lines.push({ label: f.label, value: [r && `R: ${r}`, l && `L: ${l}`].filter(Boolean).join(" · ") });
          diagrams.push({ title: "Right TM", svg: eardrumSvg(lv.right, "right") }, { title: "Left TM", svg: eardrumSvg(lv.left, "left") });
        }
        continue;
      }
      if (f.type === "audiogram") {
        const t = audiogramText(v as AudiogramValue);
        if (t) {
          lines.push({ label: f.label, value: t });
          diagrams.push({ title: "Audiogram (O right, X left)", svg: audiogramSvg(v as AudiogramValue) });
        }
        continue;
      }
      if (f.lateral) {
        const lv = v as LateralValue<unknown>;
        const r = text(lv.right, f), l = text(lv.left, f);
        if (r && r === l) lines.push({ label: f.label, value: `${side.both} ${r}` });
        else if (r || l) lines.push({ label: f.label, value: [r && `${side.right} ${r}`, l && `${side.left} ${l}`].filter(Boolean).join(", ") });
        continue;
      }
      const t = text(v, f);
      if (t) lines.push({ label: f.label, value: t });
    }
    if (lines.length) groups.push({ title: section.title, lines });
  }
  return { groups, diagrams };
}
