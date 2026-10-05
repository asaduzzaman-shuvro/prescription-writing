/**
 * Specialty examination templates (ENT first). An admin-defined schema describes the fields; the
 * encounter stores answers keyed by field id; `flattenFindings` turns answers into printable lines
 * and small vector diagrams for the prescription.
 */
import { DRAWING_DEFS, DRAWING_LIMITS, normalizeMarks, normalizeStrokes, r1, strokeSvg } from "./drawing";
import { isSketchId, SKETCHES, sketchLegendSvg, sketchNeedsLegend, sketchSvg, sketchText, type SketchId } from "./sketches";
import type { ExamFindingLine } from "./types";

export type FieldType = "select" | "multiselect" | "text" | "number" | "eardrum" | "audiogram" | "sketch";

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
  /** For `type: "sketch"`: which picture (oropharynx, larynx, neck). */
  sketch?: SketchId;
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
/** Findings placed on the drum as symbols (each printed with a legend). */
export const EARDRUM_MARKS = ["grommet", "cholesteatoma", "tympanosclerosis", "fluid", "granulation", "graft"] as const;
export type EardrumMarkKind = (typeof EARDRUM_MARKS)[number];
export const EARDRUM_MARK_LABEL: Record<EardrumMarkKind, string> = {
  grommet: "Grommet",
  cholesteatoma: "Cholesteatoma",
  tympanosclerosis: "Tympanosclerosis",
  fluid: "Fluid level",
  granulation: "Granulation",
  graft: "Graft",
};
/** Drum coordinates run 0–100 (the drum is a circle at 50,50 with radius 38). */
export interface EardrumMark {
  kind: EardrumMarkKind;
  x: number;
  y: number;
}
export interface EardrumValue {
  perforation: EardrumZone[];
  retraction: EardrumZone[];
  marks?: EardrumMark[];
  bulging?: boolean;
  /** Free-hand strokes, each "x,y x,y …" in drum coordinates (left drum: inside the mirrored group). */
  strokes?: string[];
}
/** Per ear, so a drawing can't grow without bound inside the prescription. */
export const EARDRUM_LIMITS = DRAWING_LIMITS;

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

const FIELD_TYPES: FieldType[] = ["select", "multiselect", "text", "number", "eardrum", "audiogram", "sketch"];

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
      if (f.type === "sketch" && !isSketchId(f.sketch)) errors.push(`field ${f.id}: "sketch" must be one of oropharynx, larynx, neck`);
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

/** Fill patterns shared by the drum, the legend and the editor. */
export const EARDRUM_DEFS = DRAWING_DEFS;

/** Clean an eardrum value from the (client-writable) findings: known zones/kinds only, coordinates clamped, limits applied. */
export function normalizeEardrum(v: unknown): Required<EardrumValue> {
  const o = (v && typeof v === "object" ? v : {}) as Partial<EardrumValue>;
  const zones = (a: unknown) => (Array.isArray(a) ? a.filter((z): z is EardrumZone => (EARDRUM_ZONES as readonly string[]).includes(z)) : []);
  return {
    perforation: zones(o.perforation),
    retraction: zones(o.retraction),
    marks: normalizeMarks(o.marks, EARDRUM_MARKS),
    bulging: o.bulging === true,
    strokes: normalizeStrokes(o.strokes),
  };
}

/** One symbol, centred on x,y. Shapes only (no text), so it reads the same on the mirrored left drum. */
export function eardrumMarkSvg(kind: EardrumMarkKind, x: number, y: number): string {
  switch (kind) {
    case "grommet":
      return `<circle cx="${x}" cy="${y}" r="4" fill="#fff" stroke="#111" stroke-width="1"/><circle cx="${x}" cy="${y}" r="1.6" fill="none" stroke="#111" stroke-width="0.8"/><line x1="${r1(x - 6)}" y1="${y}" x2="${r1(x - 4)}" y2="${y}" stroke="#111" stroke-width="1"/><line x1="${r1(x + 4)}" y1="${y}" x2="${r1(x + 6)}" y2="${y}" stroke="#111" stroke-width="1"/>`;
    case "cholesteatoma":
      return `<ellipse cx="${x}" cy="${y}" rx="5.5" ry="4" fill="#fff" stroke="#111" stroke-width="0.9" stroke-dasharray="1 0.8"/>`;
    case "tympanosclerosis":
      return `<ellipse cx="${x}" cy="${y}" rx="6" ry="4.5" fill="url(#stipple)" stroke="#111" stroke-width="0.5"/>`;
    case "fluid": {
      // A dashed chord across the drum at this height, with two bubbles above it.
      const cy = Math.min(84, Math.max(16, y));
      const w = r1(Math.sqrt(38 * 38 - (cy - 50) * (cy - 50)) - 1);
      return `<line x1="${r1(50 - w)}" y1="${cy}" x2="${r1(50 + w)}" y2="${cy}" stroke="#111" stroke-width="1" stroke-dasharray="2.5 1.5"/><circle cx="${r1(50 - w / 3)}" cy="${r1(cy - 3.5)}" r="1.4" fill="none" stroke="#111" stroke-width="0.6"/><circle cx="${r1(50 + w / 4)}" cy="${r1(cy - 5)}" r="1" fill="none" stroke="#111" stroke-width="0.6"/>`;
    }
    case "granulation":
      return `<circle cx="${r1(x - 1.8)}" cy="${r1(y + 1)}" r="1.7" fill="#777" stroke="#111" stroke-width="0.4"/><circle cx="${r1(x + 1.8)}" cy="${r1(y + 1)}" r="1.7" fill="#777" stroke="#111" stroke-width="0.4"/><circle cx="${x}" cy="${r1(y - 1.8)}" r="1.7" fill="#777" stroke="#111" stroke-width="0.4"/>`;
    case "graft":
      return `<circle cx="${x}" cy="${y}" r="7" fill="none" stroke="#111" stroke-width="0.9" stroke-dasharray="2 1.2"/>`;
  }
}

/** Short ticks pointing out from the rim. */
const BULGING_SVG = Array.from({ length: 12 }, (_, i) => {
  const a = (i * Math.PI) / 6;
  return `<line x1="${r1(50 + 40 * Math.cos(a))}" y1="${r1(50 + 40 * Math.sin(a))}" x2="${r1(50 + 44 * Math.cos(a))}" y2="${r1(50 + 44 * Math.sin(a))}" stroke="#111" stroke-width="1"/>`;
}).join("");

/** Bulging ticks, marks and free-hand strokes; drawn over the zones (shared with the editor). */
export function eardrumOverlaySvg(value: unknown): string {
  const v = normalizeEardrum(value);
  return (v.bulging ? BULGING_SVG : "") + v.marks.map((m) => eardrumMarkSvg(m.kind, m.x, m.y)).join("") + v.strokes.map(strokeSvg).join("");
}

export function eardrumSvg(value: EardrumValue | undefined, side: Side2): string {
  const v = normalizeEardrum(value);
  const mirror = side === "left" ? ` transform="translate(100,0) scale(-1,1)"` : "";
  const zones = EARDRUM_ZONES.map((z) => {
    const fill = v.perforation.includes(z) ? "#111" : v.retraction.includes(z) ? "url(#hatch)" : "none";
    return `<path d="${ZONE_PATHS[z]}" fill="${fill}" stroke="#555" stroke-width="0.8"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 108"><defs>${EARDRUM_DEFS}</defs><g${mirror}><circle cx="50" cy="50" r="38" fill="none" stroke="#111" stroke-width="1.5"/>${zones}<line x1="50" y1="26" x2="54" y2="56" stroke="#111" stroke-width="2"/>${eardrumOverlaySvg(v)}</g><text x="50" y="106" font-size="9" text-anchor="middle" font-family="sans-serif">${side === "right" ? "R" : "L"}</text></svg>`;
}

export type EardrumLegendKey = "perforation" | "retraction" | "bulging" | EardrumMarkKind;
const LEGEND_ORDER: EardrumLegendKey[] = ["perforation", "retraction", ...EARDRUM_MARKS, "bulging"];
const LEGEND_LABEL: Record<EardrumLegendKey, string> = { perforation: "Perforation", retraction: "Retraction", bulging: "Bulging", ...EARDRUM_MARK_LABEL };

/** Key to the symbols used, one row each. */
export function eardrumLegendSvg(keys: EardrumLegendKey[]): string {
  const used = LEGEND_ORDER.filter((k) => keys.includes(k));
  const row = 11;
  const rows = used.map((k, i) => {
    const cy = 6 + i * row;
    let sym: string;
    if (k === "perforation" || k === "retraction") sym = `<rect x="2" y="${cy - 4}" width="9" height="8" fill="${k === "perforation" ? "#111" : "url(#hatch)"}" stroke="#555" stroke-width="0.6"/>`;
    else if (k === "bulging") sym = `<circle cx="6.5" cy="${cy}" r="3" fill="none" stroke="#111" stroke-width="0.8"/><line x1="6.5" y1="${cy - 3.5}" x2="6.5" y2="${cy - 5.5}" stroke="#111" stroke-width="0.8"/><line x1="6.5" y1="${cy + 3.5}" x2="6.5" y2="${cy + 5.5}" stroke="#111" stroke-width="0.8"/><line x1="2.5" y1="${cy}" x2="0.5" y2="${cy}" stroke="#111" stroke-width="0.8"/><line x1="10.5" y1="${cy}" x2="12.5" y2="${cy}" stroke="#111" stroke-width="0.8"/>`;
    else if (k === "fluid") sym = `<line x1="0.5" y1="${cy + 1}" x2="12.5" y2="${cy + 1}" stroke="#111" stroke-width="1" stroke-dasharray="2.5 1.5"/><circle cx="4.5" cy="${cy - 2.5}" r="1.4" fill="none" stroke="#111" stroke-width="0.6"/>`;
    else if (k === "graft") sym = `<circle cx="6.5" cy="${cy}" r="4" fill="none" stroke="#111" stroke-width="0.9" stroke-dasharray="2 1.2"/>`;
    else sym = eardrumMarkSvg(k, 6.5, cy);
    return `${sym}<text x="17" y="${cy + 2.5}" font-size="7" font-family="sans-serif">${LEGEND_LABEL[k]}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 86 ${used.length * row + 1}"><defs>${EARDRUM_DEFS}</defs>${rows.join("")}</svg>`;
}

function eardrumUsed(v: Required<EardrumValue>): EardrumLegendKey[] {
  return [
    ...(v.perforation.length ? (["perforation"] as const) : []),
    ...(v.retraction.length ? (["retraction"] as const) : []),
    ...(v.bulging ? (["bulging"] as const) : []),
    ...v.marks.map((m) => m.kind),
  ];
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

function eardrumText(value: EardrumValue | undefined): string {
  if (!value) return "";
  const v = normalizeEardrum(value);
  const parts: string[] = [];
  if (v.perforation.length) parts.push(`perforation ${v.perforation.map((z) => ZONE_LABEL[z]).join("+")}`);
  if (v.retraction.length) parts.push(`retraction ${v.retraction.map((z) => ZONE_LABEL[z]).join("+")}`);
  for (const k of EARDRUM_MARKS) if (v.marks.some((m) => m.kind === k)) parts.push(EARDRUM_MARK_LABEL[k].toLowerCase());
  if (v.bulging) parts.push("bulging");
  if (v.strokes.length) parts.push("drawing");
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

export type DiagramKind = "tm" | "tm-legend" | "audiogram" | "sketch" | "legend";
export interface Diagram {
  title: string;
  svg: string;
  kind?: DiagramKind;
  /** Which picture a sketch or its key belongs to. */
  ref?: string;
}

export interface FlattenedExam {
  groups: { title: string; lines: ExamFindingLine[] }[];
  diagrams: Diagram[];
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
          diagrams.push({ title: "Right TM", svg: eardrumSvg(lv.right, "right"), kind: "tm" }, { title: "Left TM", svg: eardrumSvg(lv.left, "left"), kind: "tm" });
          // A key only when the new symbols are used, so plain perforation/retraction prints as before.
          const used = [...eardrumUsed(normalizeEardrum(lv.right)), ...eardrumUsed(normalizeEardrum(lv.left))];
          if (used.some((k) => k !== "perforation" && k !== "retraction")) diagrams.push({ title: "Key", svg: eardrumLegendSvg(used), kind: "tm-legend" });
        }
        continue;
      }
      if (f.type === "sketch") {
        if (!isSketchId(f.sketch)) continue;
        const t = sketchText(f.sketch, v);
        if (t) {
          lines.push({ label: f.label, value: t });
          diagrams.push({ title: SKETCHES[f.sketch].title, svg: sketchSvg(f.sketch, v), kind: "sketch", ref: f.sketch });
          if (sketchNeedsLegend(f.sketch, v)) diagrams.push({ title: "Key", svg: sketchLegendSvg(f.sketch, v), kind: "legend", ref: f.sketch });
        }
        continue;
      }
      if (f.type === "audiogram") {
        const t = audiogramText(v as AudiogramValue);
        if (t) {
          lines.push({ label: f.label, value: t });
          diagrams.push({ title: "Audiogram (O right, X left)", svg: audiogramSvg(v as AudiogramValue), kind: "audiogram" });
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
