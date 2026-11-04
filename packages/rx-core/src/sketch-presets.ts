import { DRAWING_LIMITS, type PlacedMark } from "./drawing";
import { normalizeSketch, type NormalizedSketch, type SketchId } from "./sketches";
import type { Findings, LateralValue, SpecialtyTemplateSchema } from "./specialty";

/**
 * Nose, throat and neck answers → the nose, throat and neck pictures. Like the TM map, an answer draws a starting
 * picture the doctor can still edit; changing the answer swaps only what the old answer drew.
 * Option text is matched as written in the ENT template, so a renamed option simply draws nothing.
 * Findings with no side in the answer (a single laryngeal polyp, growth, quinsy) and findings the
 * pictures can't show (external nose, Cottle's test) aren't drawn: the doctor places what applies,
 * since guessing a side would put a wrong mark on the prescription.
 */

/** What the answers draw on one picture: zone states, zone sizes (a tonsil's grade) and symbols. */
export interface SketchPreset {
  zones: Record<string, string>;
  sizes?: Record<string, number>;
  marks: PlacedMark[];
}

/** ENT template fields read here. */
export const SKETCH_LINK = {
  septum: "nose_septum",
  turbinate: "nose_turbinate",
  mucosa: "nose_mucosa",
  discharge: "nose_discharge",
  cavity: "nose_cavity",
  polyp: "nose_polyp",
  sinusTender: "nose_sinus_tender",
  tonsilGrade: "thr_tonsil_grade",
  tonsil: "thr_tonsil",
  ppw: "thr_ppw",
  cords: "thr_cords",
  neck: "thr_neck",
} as const;

const empty = (): SketchPreset => ({ zones: {}, marks: [] });

const one = (f: Findings, id: string) => (typeof f[id] === "string" ? (f[id] as string) : undefined);
/** Every answer of a multi-select field, or an old single answer saved before it took several. */
const list = (v: unknown) => (typeof v === "string" ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const many = (f: Findings, id: string) => (Array.isArray(f[id]) ? (f[id] as unknown[]).filter((x): x is string => typeof x === "string") : []);
const side = (f: Findings, id: string, s: "right" | "left") => {
  const v = (f[id] as LateralValue<unknown> | undefined)?.[s];
  return typeof v === "string" ? v : undefined;
};
const sideList = (f: Findings, id: string, s: "right" | "left") => list((f[id] as LateralValue<unknown> | undefined)?.[s]);

/** Symbol positions, in each picture's own coordinates (patient's right on the viewer's left). */
const AT = {
  // Septum symbols sit on the septum (x = 50); polyps run down from the middle meatus.
  deviation: [50, 58],
  sShape: { right: [50, 38], left: [50, 74] },
  spur: [50, 82],
  septalHole: [50, 64],
  haematoma: [50, 56],
  polyp: { right: [[42, 62], [45, 72], [45, 88]], left: [[61.5, 62], [58.5, 72], [58.5, 88]] },
  discharge: { right: [41, 90], left: [59, 90] },
  // Nasal cavity findings, high in the narrow upper cavity where nothing else is drawn: foreign body above, mass below.
  fb: { right: [46.2, 26], left: [53.8, 26] },
  mass: { right: [46.2, 38], left: [53.8, 38] },
  crust: { right: [42, 74], left: [58, 74] }, // on the inferior turbinates
  tonsil: { right: { pus: [24, 52], membrane: [24, 62] }, left: { pus: [76, 52], membrane: [76, 62] } },
  ppwBulge: [50, 56],
  // Junction of the anterior and middle thirds of each cord: the usual site of vocal nodules.
  nodule: { right: [46.6, 49.7], left: [53.4, 49.7] },
  midline: [50, 58],
} as const;
const mark = (kind: string, [x, y]: readonly [number, number]): PlacedMark => ({ kind, x, y });

/**
 * Every picture's preset for these answers. Later rules win a zone (e.g. "Congested" over a grade's "Swollen"); within a
 * multi-select field, the answer later in its option list wins (turbinate "Congested" over "Hypertrophied").
 */
export function sketchPresets(f: Findings): Record<SketchId, SketchPreset> {
  const nose = empty(), oro = empty(), lar = empty(), neck = empty();
  const L = SKETCH_LINK;

  // Septum findings in option order, so the picture doesn't depend on tick order.
  const septum = list(f[L.septum]);
  const SEPTUM: [string, PlacedMark[]][] = [
    ["DNS to right", [mark("dev_r", AT.deviation)]],
    ["DNS to left", [mark("dev_l", AT.deviation)]],
    ["S-shaped DNS", [mark("dev_r", AT.sShape.right), mark("dev_l", AT.sShape.left)]],
    ["Spur right", [mark("spur_r", AT.spur)]],
    ["Spur left", [mark("spur_l", AT.spur)]],
    ["Perforation", [mark("perforation", AT.septalHole)]],
    ["Haematoma", [mark("haematoma", AT.haematoma)]],
  ];
  for (const [answer, marks] of SEPTUM) if (septum.includes(answer)) nose.marks.push(...marks);
  const mucosa = list(f[L.mucosa]);
  for (const [answer, st] of [["Pale", "pale"], ["Congested", "congested"]] as const) if (mucosa.includes(answer)) nose.zones.r_cavity = nose.zones.l_cavity = st;
  if (mucosa.includes("Crusting")) nose.marks.push(mark("crust", AT.crust.right), mark("crust", AT.crust.left));
  for (const s of ["right", "left"] as const) {
    const it = sideList(f, L.turbinate, s);
    for (const [answer, st] of [["Hypertrophied", "hypertrophied"], ["Pale & boggy", "pale"], ["Congested", "congested"]] as const)
      if (it.includes(answer)) nose.zones[s === "right" ? "r_it" : "l_it"] = st;
    const polyp = side(f, L.polyp, s), cavity = sideList(f, L.cavity, s);
    // Grade 1–3: one polyp per grade, down from the middle meatus; antrochoanal: meatus to the floor. A polyp ticked
    // in Nasal cavity but not graded yet draws one.
    const graded = polyp === "Antrochoanal" ? 0 : Number(/grade (\d)/i.exec(polyp ?? "")?.[1] ?? 0);
    const n = graded || (polyp !== "Antrochoanal" && cavity.includes("Polyp") ? 1 : 0);
    for (const at of polyp === "Antrochoanal" ? [AT.polyp[s][0], AT.polyp[s][2]] : AT.polyp[s].slice(0, n)) nose.marks.push(mark("polyp", at));
    if (cavity.includes("Nasal mass")) nose.marks.push(mark("mass", AT.mass[s]));
    if (cavity.includes("Foreign body")) nose.marks.push(mark("fb", AT.fb[s]));
    if (sideList(f, L.discharge, s).some((d) => d !== "None")) nose.marks.push(mark("discharge", AT.discharge[s]));
  }
  for (const sinus of many(f, L.sinusTender)) {
    const k = ({ Maxillary: "maxillary", Frontal: "frontal", Ethmoid: "ethmoid" } as Record<string, string>)[sinus];
    if (k) nose.zones[`r_${k}`] = nose.zones[`l_${k}`] = "tender";
  }

  // Each grade draws the tonsil at its size (Grade 0 in the fossa … Grade 4 nearly meeting at the midline).
  for (const s of ["right", "left"] as const) {
    const grade = /^Grade ([0-4])$/.exec(side(f, L.tonsilGrade, s) ?? "")?.[1];
    if (grade !== undefined) (oro.sizes ??= {})[s === "right" ? "r_tonsil" : "l_tonsil"] = Number(grade);
  }
  const surface = many(f, L.tonsil);
  if (surface.includes("Congested")) oro.zones.r_tonsil = oro.zones.l_tonsil = "congested";
  if (surface.includes("Anterior tonsillar pillar congested")) oro.zones.r_ant_pillar = oro.zones.l_ant_pillar = "congested";
  for (const s of ["right", "left"] as const) {
    if (surface.includes("Pus in crypts")) oro.marks.push(mark("pus", AT.tonsil[s].pus));
    if (surface.includes("Membrane")) oro.marks.push(mark("membrane", AT.tonsil[s].membrane));
  }
  if (surface.includes("Jugulodigastric LN enlarged")) neck.zones.r_ii = neck.zones.l_ii = "enlarged";

  // Several findings since it became a multi-select; an older single answer still reads.
  const ppw = list(f[L.ppw]);
  if (ppw.includes("Congested") || ppw.includes("Granular")) oro.zones.ppw = "congested";
  if (ppw.includes("Bulge")) oro.marks.push(mark("bulge", AT.ppwBulge));

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

  return { nose, oropharynx: oro, larynx: lar, neck };
}

const sameMark = (a: PlacedMark, b: PlacedMark) => a.kind === b.kind && a.x === b.x && a.y === b.y;

/** Swap the old answers' picture for the new one; the doctor's own states, symbols and strokes stay. */
export function applySketchPreset(id: SketchId, value: unknown, prev: SketchPreset, next: SketchPreset): NormalizedSketch {
  const v = normalizeSketch(id, value);
  const zones = { ...v.zones };
  for (const [z, st] of Object.entries(prev.zones)) if (zones[z] === st) delete zones[z];
  Object.assign(zones, next.zones);
  const sizes = { ...v.sizes };
  for (const [z, n] of Object.entries(prev.sizes ?? {})) if (sizes[z] === n) delete sizes[z];
  Object.assign(sizes, next.sizes);
  const marks = [...v.marks];
  for (const m of prev.marks) {
    const i = marks.findIndex((x) => sameMark(x, m));
    if (i >= 0) marks.splice(i, 1);
  }
  for (const m of next.marks) if (marks.length < DRAWING_LIMITS.marks && !marks.some((x) => sameMark(x, m))) marks.push(m);
  return normalizeSketch(id, { zones, sizes, marks, strokes: v.strokes });
}

/** Redraw each nose/throat/neck picture in the template whose answers changed between `prev` and `next`. */
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
