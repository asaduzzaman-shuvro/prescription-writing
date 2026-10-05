/**
 * Shared pieces of the clinical drawings (eardrum, throat and neck pictures): fill patterns,
 * free-hand strokes, placed symbols and the limits that keep a drawing small inside a prescription.
 * Values come from the client-writable findings, so everything here cleans what it reads.
 */

/** Fill patterns used by every drawing, its key and the editor (identical everywhere, so repeated ids are harmless). */
export const DRAWING_DEFS =
  `<pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="#333" stroke-width="1"/></pattern>` +
  `<pattern id="stipple" width="2.5" height="2.5" patternUnits="userSpaceOnUse"><circle cx="1.25" cy="1.25" r="0.55" fill="#111"/></pattern>`;

/** Per drawing, so a drawing can't grow without bound inside the prescription. */
export const DRAWING_LIMITS = { marks: 20, strokes: 40, points: 2000 } as const;

export type Point = [number, number];
export interface PlacedMark<K extends string = string> {
  kind: K;
  x: number;
  y: number;
}

export const r1 = (n: number) => Math.round(n * 10) / 10;

/** A finite number clamped to 0…max and rounded to 1 decimal, or null. */
export function clampCoord(v: unknown, max = 100): number | null {
  return typeof v === "number" && Number.isFinite(v) ? r1(Math.min(max, Math.max(0, v))) : null;
}

/** "x,y x,y …" → points, dropping anything that isn't a number. */
export function parseStroke(s: unknown, w = 100, h = 100): Point[] {
  if (typeof s !== "string") return [];
  const pts: Point[] = [];
  for (const pair of s.trim().split(/\s+/)) {
    const [a, b] = pair.split(",");
    const x = clampCoord(Number(a), w), y = clampCoord(Number(b), h);
    if (a !== undefined && b !== undefined && x !== null && y !== null) pts.push([x, y]);
  }
  return pts;
}

/** Clean free-hand strokes: at least 2 points each, limits on strokes and total points. */
export function normalizeStrokes(raw: unknown, w = 100, h = 100): string[] {
  const out: string[] = [];
  let budget: number = DRAWING_LIMITS.points;
  for (const s of Array.isArray(raw) ? raw : []) {
    if (out.length >= DRAWING_LIMITS.strokes || budget < 2) break;
    const pts = parseStroke(s, w, h).slice(0, budget);
    if (pts.length < 2) continue;
    budget -= pts.length;
    out.push(pts.map((p) => p.join(",")).join(" "));
  }
  return out;
}

/** Clean placed symbols: known kinds only, coordinates clamped, at most `DRAWING_LIMITS.marks`. */
export function normalizeMarks<K extends string>(raw: unknown, kinds: readonly K[], w = 100, h = 100): PlacedMark<K>[] {
  return (Array.isArray(raw) ? raw : [])
    .flatMap((m) => {
      const x = clampCoord(m?.x, w), y = clampCoord(m?.y, h);
      return m && kinds.includes(m.kind) && x !== null && y !== null ? [{ kind: m.kind as K, x, y }] : [];
    })
    .slice(0, DRAWING_LIMITS.marks);
}

export function strokeSvg(s: string): string {
  return `<polyline points="${s}" fill="none" stroke="#111" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`;
}

const near = (a: Point, b: Point, d: number) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 <= d * d;

/** Whether `p` is within `d` of the segment a–b. */
function nearSegment(p: Point, a: Point, b: Point, d: number): boolean {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return near(p, [a[0] + t * dx, a[1] + t * dy], d);
}

/** Eraser: removes the most recent symbol near `pt`, else the most recent stroke passing near it. */
export function eraseAt<T extends { marks: PlacedMark[]; strokes: string[] }>(v: T, pt: Point): T {
  for (let i = v.marks.length - 1; i >= 0; i--) {
    const m = v.marks[i]!;
    if (near([m.x, m.y], pt, 6)) return { ...v, marks: v.marks.filter((_, j) => j !== i) };
  }
  for (let i = v.strokes.length - 1; i >= 0; i--) {
    const pts = parseStroke(v.strokes[i], 1000, 1000);
    if (pts.some((p, j) => (j ? nearSegment(pt, pts[j - 1]!, p, 4) : near(p, pt, 4)))) return { ...v, strokes: v.strokes.filter((_, j) => j !== i) };
  }
  return v;
}
