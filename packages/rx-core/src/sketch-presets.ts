import { DRAWING_LIMITS, type PlacedMark } from "./drawing";
import { normalizeSketch, type NormalizedSketch, type SketchId } from "./sketches";
import type { Findings, LateralValue, SpecialtyTemplateSchema } from "./specialty";

/**
 * Throat & neck answers → the throat and neck pictures. Like the TM map, an answer draws a starting
 * picture the doctor can still edit; changing the answer swaps only what the old answer drew.
 * Option text is matched as written in the ENT template, so a renamed option simply draws nothing.
 * Findings with no side in the answer (a single polyp, growth, quinsy) aren't drawn: the doctor
 * places them, since guessing a side would put a wrong mark on the prescription.
 */

/** What the answers draw on one picture: zone states and symbols. */
export interface SketchPreset {
  zones: Record<string, string>;
  marks: PlacedMark[];
}

/** ENT template fields read here. */
export const SKETCH_LINK = {
  tonsilGrade: "thr_tonsil_grade",
  tonsil: "thr_tonsil",
  ppw: "thr_ppw",
  cords: "thr_cords",
  neck: "thr_neck",
} as const;

const empty = (): SketchPreset => ({ zones: {}, marks: [] });

const one = (f: Findings, id: string) => (typeof f[id] === "string" ? (f[id] as string) : undefined);
const many = (f: Findings, id: string) => (Array.isArray(f[id]) ? (f[id] as unknown[]).filter((x): x is string => typeof x === "string") : []);
const side = (f: Findings, id: string, s: "right" | "left") => {
  const v = (f[id] as LateralValue<unknown> | undefined)?.[s];
  return typeof v === "string" ? v : undefined;
};

/** Symbol positions, in each picture's own coordinates (patient's right on the viewer's left). */
const AT = {
  tonsil: { right: { pus: [24, 52], membrane: [24, 62] }, left: { pus: [76, 52], membrane: [76, 62] } },
  ppwBulge: [50, 56],
  // Junction of the anterior and middle thirds of each cord: the usual site of vocal nodules.
  nodule: { right: [46.6, 49.7], left: [53.4, 49.7] },
  midline: [50, 58],
} as const;
const mark = (kind: string, [x, y]: readonly [number, number]): PlacedMark => ({ kind, x, y });

/** Every picture's preset for these answers. Later rules win a zone (e.g. "Congested" over a grade's "Swollen"). */
export function sketchPresets(f: Findings): Record<SketchId, SketchPreset> {
  const oro = empty(), lar = empty(), neck = empty();
  const L = SKETCH_LINK;

  for (const s of ["right", "left"] as const) {
    const grade = side(f, L.tonsilGrade, s);
    if (grade === "Grade 3" || grade === "Grade 4") oro.zones[s === "right" ? "r_tonsil" : "l_tonsil"] = "swollen";
  }
  const surface = many(f, L.tonsil);
  if (surface.includes("Congested")) oro.zones.r_tonsil = oro.zones.l_tonsil = "congested";
  for (const s of ["right", "left"] as const) {
    if (surface.includes("Pus in crypts")) oro.marks.push(mark("pus", AT.tonsil[s].pus));
    if (surface.includes("Membrane")) oro.marks.push(mark("membrane", AT.tonsil[s].membrane));
  }
  if (surface.includes("Jugulodigastric LN enlarged")) neck.zones.r_ii = neck.zones.l_ii = "enlarged";

  const ppw = one(f, L.ppw);
  if (ppw === "Congested" || ppw === "Granular") oro.zones.ppw = "congested";
  if (ppw === "Bulge") oro.marks.push(mark("bulge", AT.ppwBulge));

  switch (one(f, L.cords)) {
    case "Congested":
      lar.zones.r_cord = lar.zones.l_cord = "congested";
      break;
    case "Right cord palsy":
      lar.zones.r_cord = "fixed";
      break;
    case "Left cord palsy":
      lar.zones.l_cord = "fixed";
      break;
    case "Nodule":
      lar.marks.push(mark("nodule", AT.nodule.right), mark("nodule", AT.nodule.left));
      break;
  }

  // Level II (jugulodigastric) is the usual first-echelon node.
  switch (one(f, L.neck)) {
    case "LN enlarged right":
      neck.zones.r_ii = "enlarged";
      break;
    case "LN enlarged left":
      neck.zones.l_ii = "enlarged";
      break;
    case "Bilateral LN":
      neck.zones.r_ii = neck.zones.l_ii = "enlarged";
      break;
    case "Thyroid swelling":
      neck.zones.thyroid = "enlarged";
      break;
    case "Midline swelling":
      neck.marks.push(mark("mass", AT.midline));
      break;
  }

  return { oropharynx: oro, larynx: lar, neck };
}

const sameMark = (a: PlacedMark, b: PlacedMark) => a.kind === b.kind && a.x === b.x && a.y === b.y;

/** Swap the old answers' picture for the new one; the doctor's own states, symbols and strokes stay. */
export function applySketchPreset(id: SketchId, value: unknown, prev: SketchPreset, next: SketchPreset): NormalizedSketch {
  const v = normalizeSketch(id, value);
  const zones = { ...v.zones };
  for (const [z, st] of Object.entries(prev.zones)) if (zones[z] === st) delete zones[z];
  Object.assign(zones, next.zones);
  const marks = [...v.marks];
  for (const m of prev.marks) {
    const i = marks.findIndex((x) => sameMark(x, m));
    if (i >= 0) marks.splice(i, 1);
  }
  for (const m of next.marks) if (marks.length < DRAWING_LIMITS.marks && !marks.some((x) => sameMark(x, m))) marks.push(m);
  return normalizeSketch(id, { zones, marks, strokes: v.strokes });
}

/** Redraw each throat/neck picture in the template whose answers changed between `prev` and `next`. */
export function syncSketchMaps(schema: SpecialtyTemplateSchema, prev: Findings, next: Findings): Findings {
  const before = sketchPresets(prev), after = sketchPresets(next);
  let out = next;
  for (const f of schema.sections.flatMap((s) => s.fields)) {
    if (f.type !== "sketch" || !f.sketch) continue;
    const a = before[f.sketch], b = after[f.sketch];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    out = { ...out, [f.id]: applySketchPreset(f.sketch, out[f.id], a, b) };
  }
  return out;
}
