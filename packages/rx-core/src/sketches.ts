import { DRAWING_DEFS, normalizeMarks, normalizeStrokes, r1, strokeSvg, type PlacedMark } from "./drawing";

/**
 * Nose, throat and neck pictures for the ENT exam: a front (coronal) view of the nose and sinuses, an
 * open-mouth (oropharynx) view, an indirect laryngoscopy view and a front view of the neck with lymph
 * node levels. Each picture is data —
 * a base outline, tappable zones, zone states and symbols — drawn by the same code on screen and on
 * paper. The patient's right is on the viewer's left in all three. Option sets follow common ENT
 * practice and must be reviewed by an ENT consultant before production use.
 */

export const SKETCH_IDS = ["nose", "oropharynx", "larynx", "neck"] as const;
export type SketchId = (typeof SKETCH_IDS)[number];

type Shape =
  | "ulcer" | "patch" | "growth" | "pus" | "bulge" | "nodule" | "polyp" | "cyst" | "leukoplakia" | "node" | "mass" | "scar" | "sinus"
  | "bowR" | "bowL" | "spurR" | "spurL" | "hole" | "diamond" | "drip";

export interface SketchDef {
  id: SketchId;
  title: string;
  /** ENT template section it prints under (used for the blank "always print" copy). */
  section: string;
  /** Drawing size; marks and strokes are stored in these units. */
  viewBox: [number, number];
  /** Static outline and labels (drawn above the zones, never tappable). */
  base: string;
  /**
   * Tappable regions in drawing order (later ones sit on top). Labels carry the side. A zone with `sizes` can be
   * drawn at one of those outlines instead of `path` (a tonsil at its grade); its size reads after the label.
   */
  zones: { id: string; label: string; path: string; sizes?: { label: string; path: string }[] }[];
  states: { id: string; label: string; fill: string }[];
  marks: { kind: string; label: string; shape: Shape }[];
}

export interface SketchValue {
  zones?: Record<string, string>;
  /** Index into a zone's `sizes`; absent draws the zone at its usual outline. */
  sizes?: Record<string, number>;
  marks?: PlacedMark[];
  strokes?: string[];
}
/** `sizes` is present only when some zone has one, so older pictures keep their exact shape. */
export type NormalizedSketch = { zones: Record<string, string>; sizes?: Record<string, number>; marks: PlacedMark[]; strokes: string[] };

/** Mirror a polygon/path made of absolute "x,y" pairs across the vertical centre line. */
const mirror = (path: string) => path.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x: string, y: string) => `${r1(100 - Number(x))},${y}`);
const poly = (pts: string) => `M${pts.trim().split(/\s+/).join(" L")} Z`;
const text = (x: number, y: number, t: string, size = 6, fill = "#111") => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" font-family="sans-serif" fill="${fill}">${t}</text>`;
const sides = (y: number) => text(5, y, "R", 7) + text(95, y, "L", 7);
/** A closed ellipse as a path (two arcs), for zones that need one. */
const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M${r1(cx - rx)},${cy} A${rx},${ry} 0 1 0 ${r1(cx + rx)},${cy} A${rx},${ry} 0 1 0 ${r1(cx - rx)},${cy} Z`;

// ---------------------------------------------------------------------------
// Oropharynx (open mouth)
// ---------------------------------------------------------------------------

// The arch is the edge of the anterior pillars (palatoglossal), lateral to each tonsil; the thin lines medial to the
// tonsils are the posterior pillars (palatopharyngeal). The band outside the arch is the soft palate on top and an
// anterior pillar down each side, split where the arch reaches y ≈ 40 (its cubic cut at t = 0.43).
const ORO_ARCH = "M14,74 C14,40 30,24 50,24 C70,24 86,40 86,74";
/**
 * Tonsil outline per Brodsky grade 0–4 (radii): each sits against the lateral wall and reaches further towards the
 * midline as the grade rises; grade 2 is the outline drawn when no grade is given.
 */
const TONSIL_GRADES: [number, number][] = [[2, 6], [4, 8], [7, 10], [10.5, 11.5], [14, 13]];
const tonsil = (s: "right" | "left", grade: number) => {
  const [rx, ry] = TONSIL_GRADES[grade]!;
  const cx = 17 + rx;
  return ellipse(s === "right" ? cx : 100 - cx, 57, rx, ry);
};
const OROPHARYNX: SketchDef = {
  id: "oropharynx",
  section: "throat",
  title: "Oropharynx",
  viewBox: [100, 108],
  zones: [
    { id: "palate", label: "Soft palate", path: "M5.93,40 A46,42 0 0 1 94.07,40 L78.08,39.92 C71.5,29.19 61.4,24 50,24 C38.6,24 28.5,29.19 21.92,39.92 Z" },
    { id: "r_ant_pillar", label: "R anterior pillar", path: "M10,72.7 A46,42 0 0 1 5.93,40 L21.92,39.92 C16.96,48.02 14,59.38 14,74 Z" },
    { id: "l_ant_pillar", label: "L anterior pillar", path: "M90,72.7 A46,42 0 0 0 94.07,40 L78.08,39.92 C83.04,48.02 86,59.38 86,74 Z" },
    { id: "ppw", label: "Posterior pharyngeal wall", path: `${ORO_ARCH} Z` },
    { id: "tongue", label: "Tongue", path: "M10,72.7 Q50,60 90,72.7 A46,42 0 0 1 10,72.7 Z" },
    { id: "uvula", label: "Uvula", path: "M45.5,24 C45.5,34 44,41 50,45 C56,41 54.5,34 54.5,24 Z" },
    { id: "r_tonsil", label: "R tonsil", path: tonsil("right", 2), sizes: TONSIL_GRADES.map((_, g) => ({ label: `grade ${g}`, path: tonsil("right", g) })) },
    { id: "l_tonsil", label: "L tonsil", path: tonsil("left", 2), sizes: TONSIL_GRADES.map((_, g) => ({ label: `grade ${g}`, path: tonsil("left", g) })) },
  ],
  base:
    `<ellipse cx="50" cy="52" rx="46" ry="42" fill="none" stroke="#111" stroke-width="1.5"/>` +
    `<path d="${ORO_ARCH}" fill="none" stroke="#111" stroke-width="1.1"/>` +
    `<path d="M33,69 C32,52 38,40 46,35" fill="none" stroke="#555" stroke-width="0.8"/><path d="M67,69 C68,52 62,40 54,35" fill="none" stroke="#555" stroke-width="0.8"/>` +
    sides(105),
  states: [
    { id: "congested", label: "Congested", fill: "url(#hatch)" },
    { id: "swollen", label: "Swollen", fill: "#bbb" },
    { id: "granular", label: "Granular", fill: "url(#stipple)" },
  ],
  marks: [
    { kind: "ulcer", label: "Ulcer", shape: "ulcer" },
    { kind: "membrane", label: "Membrane / slough", shape: "patch" },
    { kind: "pus", label: "Pus / exudate", shape: "pus" },
    { kind: "growth", label: "Growth", shape: "growth" },
    { kind: "bulge", label: "Bulge (quinsy)", shape: "bulge" },
    { kind: "pnd", label: "Post-nasal drip", shape: "drip" },
  ],
};

// ---------------------------------------------------------------------------
// Larynx (indirect laryngoscopy: epiglottis at the top, arytenoids at the bottom)
// ---------------------------------------------------------------------------

const R_FALSE = "M48,34 C40,40 32,58 30,74 L37,74 L49.5,36 Z";
const R_CORD = "M49.5,36 L37,74 L43.5,74 L50,39 Z";
const R_ARYT = "M34,80 A6,6 0 1 0 46,80 A6,6 0 1 0 34,80 Z";
const LARYNX: SketchDef = {
  id: "larynx",
  section: "throat",
  title: "Larynx (IDL)",
  viewBox: [100, 108],
  zones: [
    { id: "epiglottis", label: "Epiglottis", path: "M22,30 C26,12 74,12 78,30 C70,23 30,23 22,30 Z" },
    { id: "r_false", label: "R false cord", path: R_FALSE },
    { id: "l_false", label: "L false cord", path: mirror(R_FALSE) },
    { id: "r_cord", label: "R vocal cord", path: R_CORD },
    { id: "l_cord", label: "L vocal cord", path: mirror(R_CORD) },
    { id: "r_aryt", label: "R arytenoid", path: R_ARYT },
    { id: "l_aryt", label: "L arytenoid", path: "M54,80 A6,6 0 1 0 66,80 A6,6 0 1 0 54,80 Z" },
  ],
  base:
    `<circle cx="50" cy="52" r="46" fill="none" stroke="#111" stroke-width="1.5"/>` +
    `<path d="M50,39 L43.5,74 L56.5,74 Z" fill="#444"/>` + // airway between the cords
    `<path d="M22,30 C17,50 25,70 34,80" fill="none" stroke="#555" stroke-width="0.8"/><path d="M78,30 C83,50 75,70 66,80" fill="none" stroke="#555" stroke-width="0.8"/>` +
    sides(105),
  states: [
    { id: "congested", label: "Congested", fill: "url(#hatch)" },
    { id: "fixed", label: "Fixed (palsy)", fill: "#bbb" },
  ],
  marks: [
    { kind: "nodule", label: "Nodule", shape: "nodule" },
    { kind: "polyp", label: "Polyp", shape: "polyp" },
    { kind: "cyst", label: "Cyst", shape: "cyst" },
    { kind: "leukoplakia", label: "Leukoplakia", shape: "leukoplakia" },
    { kind: "growth", label: "Growth", shape: "growth" },
  ],
};

// ---------------------------------------------------------------------------
// Neck (front view, lymph node levels)
// ---------------------------------------------------------------------------

// Right side; the left is mirrored. Hyoid at y=45, cricoid at y=72, clavicle at y=100.
const R_LEVELS = {
  ib: poly("22,20.3 43,30.5 46,45 31.4,45"),
  ii: poly("18,22 22,20.3 31.4,45 20.4,45"),
  iii: poly("20.4,45 31.4,45 35.6,72 23.1,72"),
  iv: poly("23.1,72 35.6,72 40,100 26,100"),
  v: poly("18,16 18,22 26,100 8,100"),
};
const NECK: SketchDef = {
  id: "neck",
  section: "neck",
  title: "Neck",
  viewBox: [100, 112],
  zones: [
    { id: "vi", label: "Level VI", path: poly("31.4,45 68.6,45 64.4,72 60,100 40,100 35.6,72") },
    { id: "ia", label: "Level Ia", path: poly("43,30.5 57,30.5 54,45 46,45") },
    ...(["ib", "ii", "iii", "iv", "v"] as const).flatMap((k) => [
      { id: `r_${k}`, label: `R level ${k.toUpperCase()}`, path: R_LEVELS[k] },
      { id: `l_${k}`, label: `L level ${k.toUpperCase()}`, path: mirror(R_LEVELS[k]) },
    ]),
    { id: "thyroid", label: "Thyroid", path: "M41,70 C37,84 45,88 50,80 C55,88 63,84 59,70 C55,74 45,74 41,70 Z" },
  ],
  base:
    `<path d="M18,16 Q50,46 82,16" fill="none" stroke="#111" stroke-width="1.3"/>` + // jaw
    `<path d="M18,16 L8,100" fill="none" stroke="#111" stroke-width="1.3"/><path d="M82,16 L92,100" fill="none" stroke="#111" stroke-width="1.3"/>` +
    `<path d="M8,100 Q26,95 46,101" fill="none" stroke="#111" stroke-width="1.1"/><path d="M54,101 Q74,95 92,100" fill="none" stroke="#111" stroke-width="1.1"/>` + // clavicles
    `<line x1="45" y1="45" x2="55" y2="45" stroke="#555" stroke-width="1"/>` + // hyoid
    [
      [50, 40, "Ia"], [37, 38, "Ib"], [63, 38, "Ib"], [24, 38, "II"], [76, 38, "II"], [28, 61, "III"], [72, 61, "III"],
      [32, 90, "IV"], [68, 90, "IV"], [16, 78, "V"], [84, 78, "V"], [50, 93, "VI"],
    ].map(([x, y, t]) => text(x as number, y as number, t as string, 5, "#555")).join("") +
    sides(110),
  states: [
    { id: "enlarged", label: "Enlarged", fill: "#bbb" },
    { id: "tender", label: "Tender", fill: "url(#hatch)" },
  ],
  marks: [
    { kind: "node", label: "Lymph node", shape: "node" },
    { kind: "mass", label: "Swelling / mass", shape: "mass" },
    { kind: "scar", label: "Scar", shape: "scar" },
    { kind: "sinus", label: "Sinus", shape: "sinus" },
  ],
};

// ---------------------------------------------------------------------------
// Nose & sinuses (coronal: frontal sinuses at the top, maxillary sinuses beside the nasal cavities)
// ---------------------------------------------------------------------------

const R_NOSE = {
  frontal: "M36,7 C39,2 47,2 48.5,7 L48.5,17 C44,18.5 39,17.5 36,14 Z",
  ethmoid: poly("35.5,20 44,20 44,46 35.5,46"),
  maxillary: "M12,50 L35.5,48 L35.5,92 C26,95 16,91 12,83 Z",
  cavity: poly("44,20 48.5,20 48.5,94 35.5,94 35.5,46 44,46"),
  mt: "M35.5,48 C42,47 46,52 45,57 C44,60 40,59 35.5,57 Z",
  it: "M35.5,66 C43,64 47.5,71 46.5,79 C45,84 40,84 35.5,82 Z",
};
const NOSE: SketchDef = {
  id: "nose",
  section: "nose",
  title: "Nose & sinuses",
  viewBox: [100, 108],
  zones: [
    ...(["frontal", "ethmoid", "maxillary", "cavity"] as const).flatMap((k) => {
      const label = { frontal: "frontal sinus", ethmoid: "ethmoid", maxillary: "maxillary sinus", cavity: "nasal cavity" }[k];
      return [
        { id: `r_${k}`, label: `R ${label}`, path: R_NOSE[k] },
        { id: `l_${k}`, label: `L ${label}`, path: mirror(R_NOSE[k]) },
      ];
    }),
    { id: "septum", label: "Septum", path: poly("48.5,18 51.5,18 51.5,94 48.5,94") },
    ...(["mt", "it"] as const).flatMap((k) => {
      const label = k === "mt" ? "middle turbinate" : "inferior turbinate";
      return [
        { id: `r_${k}`, label: `R ${label}`, path: R_NOSE[k] },
        { id: `l_${k}`, label: `L ${label}`, path: mirror(R_NOSE[k]) },
      ];
    }),
  ],
  base:
    `<circle cx="22" cy="33" r="12" fill="none" stroke="#555" stroke-width="0.8"/><circle cx="78" cy="33" r="12" fill="none" stroke="#555" stroke-width="0.8"/>` + // orbits
    `<line x1="10" y1="94.5" x2="90" y2="94.5" stroke="#111" stroke-width="1.5"/>` + // palate
    [R_NOSE.mt, R_NOSE.it].flatMap((p) => [p, mirror(p)]).map((p) => `<path d="${p}" fill="none" stroke="#555" stroke-width="0.8"/>`).join("") + // turbinates
    [[42, 13, "F"], [58, 13, "F"], [39.8, 35, "E"], [60.2, 35, "E"], [23, 72, "Max"], [77, 72, "Max"]]
      .map(([x, y, t]) => text(x as number, y as number, t as string, 4.5, "#555")).join("") +
    sides(105),
  states: [
    { id: "congested", label: "Congested", fill: "url(#hatch)" },
    { id: "hypertrophied", label: "Hypertrophied", fill: "#bbb" },
    { id: "pale", label: "Pale / boggy", fill: "url(#stipple)" },
    { id: "tender", label: "Tender", fill: "url(#cross)" },
  ],
  marks: [
    { kind: "polyp", label: "Polyp", shape: "polyp" },
    { kind: "mass", label: "Nasal mass", shape: "growth" },
    { kind: "fb", label: "Foreign body", shape: "diamond" },
    { kind: "discharge", label: "Discharge", shape: "pus" },
    { kind: "crust", label: "Crusting", shape: "leukoplakia" },
    { kind: "dev_r", label: "Septum deviated to right", shape: "bowR" },
    { kind: "dev_l", label: "Septum deviated to left", shape: "bowL" },
    { kind: "spur_r", label: "Spur to right", shape: "spurR" },
    { kind: "spur_l", label: "Spur to left", shape: "spurL" },
    { kind: "perforation", label: "Septal perforation", shape: "hole" },
    { kind: "haematoma", label: "Septal haematoma", shape: "mass" },
  ],
};

export const SKETCHES: Record<SketchId, SketchDef> = { nose: NOSE, oropharynx: OROPHARYNX, larynx: LARYNX, neck: NECK };

export function isSketchId(id: unknown): id is SketchId {
  return typeof id === "string" && (SKETCH_IDS as readonly string[]).includes(id);
}

// ---------------------------------------------------------------------------
// Symbols
// ---------------------------------------------------------------------------

/** One symbol centred on x,y (shapes only). `compact` keeps the tall septum symbols within a key row. */
function shapeSvg(shape: Shape, x: number, y: number, compact = false): string {
  const c = (dx: number, dy: number, r: number, fill: string, sw = 0.6) => `<circle cx="${r1(x + dx)}" cy="${r1(y + dy)}" r="${r}" fill="${fill}" stroke="#111" stroke-width="${sw}"/>`;
  switch (shape) {
    case "ulcer":
      return c(0, 0, 3.2, "#fff", 0.9) + `<circle cx="${x}" cy="${y}" r="1.2" fill="#111"/>`;
    case "patch":
      return `<ellipse cx="${x}" cy="${y}" rx="5" ry="3.5" fill="#fff" stroke="#111" stroke-width="0.9" stroke-dasharray="1 0.8"/>`;
    case "pus":
      return c(-2, -1.5, 1.1, "#fff") + c(2, -1.5, 1.1, "#fff") + c(-1, 1.8, 1.1, "#fff") + c(2.5, 2, 1.1, "#fff");
    case "growth":
      return c(-2, 1, 2, "#333", 0.4) + c(2, 1, 2, "#333", 0.4) + c(0, -2, 2, "#333", 0.4) + c(0, 2.5, 1.6, "#333", 0.4);
    case "bulge":
      return `<path d="M${r1(x - 3)},${r1(y - 5)} Q${r1(x + 6)},${y} ${r1(x - 3)},${r1(y + 5)}" fill="none" stroke="#111" stroke-width="1.4"/><path d="M${r1(x - 6)},${r1(y - 3.5)} Q${r1(x + 2)},${y} ${r1(x - 6)},${r1(y + 3.5)}" fill="none" stroke="#111" stroke-width="0.7"/>`;
    case "nodule":
      return `<circle cx="${x}" cy="${y}" r="1.8" fill="#111"/>`;
    case "polyp":
      return `<line x1="${r1(x - 4.5)}" y1="${y}" x2="${r1(x - 2.6)}" y2="${y}" stroke="#111" stroke-width="0.8"/>` + c(0, 0, 2.6, "#fff", 0.9);
    case "cyst":
      return c(0, 0, 2.6, "none", 0.9) + c(0, 0, 1.2, "none", 0.5);
    case "leukoplakia":
      return `<ellipse cx="${x}" cy="${y}" rx="4" ry="2.5" fill="url(#stipple)" stroke="#111" stroke-width="0.5"/>`;
    case "node":
      return c(0, 0, 2.6, "#666", 0.8);
    case "mass":
      return `<ellipse cx="${x}" cy="${y}" rx="6" ry="4.5" fill="#ddd" stroke="#111" stroke-width="0.9" stroke-dasharray="2 1"/>`;
    case "scar":
      return `<line x1="${r1(x - 6)}" y1="${y}" x2="${r1(x + 6)}" y2="${y}" stroke="#111" stroke-width="0.9"/>` +
        [-4, -1.3, 1.3, 4].map((dx) => `<line x1="${r1(x + dx)}" y1="${r1(y - 1.6)}" x2="${r1(x + dx)}" y2="${r1(y + 1.6)}" stroke="#111" stroke-width="0.7"/>`).join("");
    case "bowR":
    case "bowL": {
      // The septum bowing towards one side: blank out the straight septum here, then draw the curve.
      const h = compact ? 4.5 : 9, d = (compact ? 5 : 10) * (shape === "bowR" ? -1 : 1);
      return `<line x1="${x}" y1="${r1(y - h)}" x2="${x}" y2="${r1(y + h)}" stroke="#fff" stroke-width="3.4"/>` +
        `<path d="M${x},${r1(y - h)} Q${r1(x + d)},${y} ${x},${r1(y + h)}" fill="none" stroke="#111" stroke-width="1.4"/>`;
    }
    case "spurR":
    case "spurL": {
      const d = shape === "spurR" ? -6 : 6;
      return `<path d="M${x},${r1(y - 3)} L${r1(x + d)},${y} L${x},${r1(y + 3)} Z" fill="#111"/>`;
    }
    case "hole":
      return `<ellipse cx="${x}" cy="${y}" rx="1.6" ry="3" fill="#111"/>`;
    case "diamond":
      return `<path d="M${x},${r1(y - 2.6)} L${r1(x + 2.2)},${y} L${x},${r1(y + 2.6)} L${r1(x - 2.2)},${y} Z" fill="#111"/>`;
    case "sinus":
      return c(0, 0, 2.2, "#fff", 0.9) + `<circle cx="${x}" cy="${y}" r="0.7" fill="#111"/>`;
    case "drip":
      // Two trickles, each ending in a drop.
      return [-1.6, 1.6]
        .map((dx) => `<line x1="${r1(x + dx)}" y1="${r1(y - 4)}" x2="${r1(x + dx)}" y2="${r1(y + 1.6)}" stroke="#111" stroke-width="0.7"/><circle cx="${r1(x + dx)}" cy="${r1(y + 2.8)}" r="0.9" fill="#111"/>`)
        .join("");
  }
}

export function sketchMarkSvg(id: SketchId, kind: string, x: number, y: number): string {
  const m = SKETCHES[id].marks.find((k) => k.kind === kind);
  return m ? shapeSvg(m.shape, x, y) : "";
}

// ---------------------------------------------------------------------------
// Values, drawing, text
// ---------------------------------------------------------------------------

/** Clean a value from the (client-writable) findings: known zones/states/kinds only, coordinates clamped, limits applied. */
export function normalizeSketch(id: SketchId, value: unknown): NormalizedSketch {
  const def = SKETCHES[id];
  const o = (value && typeof value === "object" ? value : {}) as SketchValue;
  const [w, h] = def.viewBox;
  const raw = o.zones && typeof o.zones === "object" ? o.zones : {};
  const zones: Record<string, string> = {};
  for (const z of def.zones) {
    const st = (raw as Record<string, unknown>)[z.id];
    if (typeof st === "string" && def.states.some((s) => s.id === st)) zones[z.id] = st;
  }
  const rawSizes = o.sizes && typeof o.sizes === "object" ? (o.sizes as Record<string, unknown>) : {};
  const sizes: Record<string, number> = {};
  for (const z of def.zones) {
    const n = rawSizes[z.id];
    if (z.sizes && typeof n === "number" && Number.isInteger(n) && n >= 0 && n < z.sizes.length) sizes[z.id] = n;
  }
  return {
    zones,
    ...(Object.keys(sizes).length ? { sizes } : {}),
    marks: normalizeMarks(o.marks, def.marks.map((m) => m.kind), w, h),
    strokes: normalizeStrokes(o.strokes, w, h),
  };
}

export function sketchIsEmpty(v: NormalizedSketch): boolean {
  return !Object.keys(v.zones).length && !Object.keys(v.sizes ?? {}).length && !v.marks.length && !v.strokes.length;
}

/**
 * Stroke of one zone's outline: light grey for areas, dark for a zone that changes size (a tonsil), so its size
 * reads clearly on screen and on paper even when it has no state.
 */
export function sketchZoneStroke(id: SketchId, zoneId: string): { stroke: string; width: number } {
  return SKETCHES[id].zones.find((z) => z.id === zoneId)?.sizes ? { stroke: "#111", width: 0.9 } : { stroke: "#999", width: 0.5 };
}

/** Outline of one zone: the size it was given (a tonsil's grade), else its usual one. */
export function sketchZonePath(id: SketchId, v: NormalizedSketch, zoneId: string): string {
  const z = SKETCHES[id].zones.find((x) => x.id === zoneId);
  if (!z) return "";
  const n = v.sizes?.[zoneId];
  return (n === undefined ? undefined : z.sizes?.[n]?.path) ?? z.path;
}

/** Fill of one zone for its current state (white when unmarked, so the whole zone is tappable). */
export function sketchZoneFill(id: SketchId, v: NormalizedSketch, zoneId: string): string {
  const st = v.zones[zoneId];
  return SKETCHES[id].states.find((s) => s.id === st)?.fill ?? "#fff";
}

/** Symbols and free-hand strokes, drawn above the outline (shared with the editor). */
export function sketchOverlaySvg(id: SketchId, value: unknown): string {
  const v = normalizeSketch(id, value);
  return v.marks.map((m) => sketchMarkSvg(id, m.kind, m.x, m.y)).join("") + v.strokes.map(strokeSvg).join("");
}

export function sketchSvg(id: SketchId, value?: unknown): string {
  const def = SKETCHES[id];
  const v = normalizeSketch(id, value);
  const zones = def.zones
    .map((z) => {
      const s = sketchZoneStroke(id, z.id);
      return `<path d="${sketchZonePath(id, v, z.id)}" fill="${sketchZoneFill(id, v, z.id)}" stroke="${s.stroke}" stroke-width="${s.width}"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${def.viewBox[0]} ${def.viewBox[1]}"><defs>${DRAWING_DEFS}</defs>${zones}${def.base}${sketchOverlaySvg(id, v)}</svg>`;
}

/** Key to the states and symbols used, one row each. */
export function sketchLegendSvg(id: SketchId, value: unknown): string {
  const def = SKETCHES[id];
  const v = normalizeSketch(id, value);
  const usedStates = def.states.filter((s) => Object.values(v.zones).includes(s.id));
  const usedMarks = def.marks.filter((m) => v.marks.some((x) => x.kind === m.kind));
  const row = 11;
  const rows = [
    ...usedStates.map((s) => (cy: number) => `<rect x="2" y="${cy - 4}" width="9" height="8" fill="${s.fill}" stroke="#555" stroke-width="0.6"/>${legendText(cy, s.label)}`),
    ...usedMarks.map((m) => (cy: number) => `${shapeSvg(m.shape, 6.5, cy, true)}${legendText(cy, m.label)}`),
  ].map((draw, i) => draw(6 + i * row));
  // Wide enough for the longest label (about 3.9 units a character at this size), so none is cut off.
  const longest = Math.max(0, ...[...usedStates, ...usedMarks].map((x) => x.label.length));
  const width = Math.max(86, Math.ceil(17 + longest * 3.9));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${rows.length * row + 1}"><defs>${DRAWING_DEFS}</defs>${rows.join("")}</svg>`;
}
const legendText = (cy: number, label: string) => `<text x="17" y="${cy + 2.5}" font-size="7" font-family="sans-serif">${label}</text>`;

/** "R tonsil congested, uvula swollen; ulcer, membrane / slough; drawing" (definition order, so it doesn't depend on tap order). */
export function sketchText(id: SketchId, value: unknown): string {
  const def = SKETCHES[id];
  const v = normalizeSketch(id, value);
  // A sized zone reads its size first: "R tonsil grade 3", "R tonsil grade 3 congested".
  const zones = def.zones
    .filter((z) => v.zones[z.id] || v.sizes?.[z.id] !== undefined)
    .map((z) => {
      const size = v.sizes?.[z.id] === undefined ? "" : z.sizes![v.sizes[z.id]!]!.label;
      const st = v.zones[z.id] ? def.states.find((s) => s.id === v.zones[z.id])!.label.toLowerCase() : "";
      return [z.label, size, st].filter(Boolean).join(" ");
    });
  const marks = def.marks.filter((m) => v.marks.some((x) => x.kind === m.kind)).map((m) => m.label.toLowerCase());
  return [zones.join(", "), marks.join(", "), v.strokes.length ? "drawing" : ""].filter(Boolean).join("; ");
}

/** True when the key has something to show (states or symbols; a drawing alone needs no key). */
export function sketchNeedsLegend(id: SketchId, value: unknown): boolean {
  const v = normalizeSketch(id, value);
  return Object.keys(v.zones).length > 0 || v.marks.length > 0;
}
