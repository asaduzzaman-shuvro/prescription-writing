/**
 * Code 39 barcode as inline SVG. Readable by any handheld scanner, needs no library and works offline.
 * Each character is 9 elements (bar, space, bar … bar); 3 of them are wide.
 */
const CODE39: Record<string, string> = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn", "4": "nnnwwnnnw",
  "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw", "8": "wnnwnnwnn", "9": "nnwwnnwnn",
  A: "wnnnnwnnw", B: "nnwnnwnnw", C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn",
  F: "nnwnwwnnn", G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn",
  K: "wnnnnnnww", L: "nnwnnnnww", M: "wnwnnnnwn", N: "nnnnwnnww", O: "wnnnwnnwn",
  P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn", S: "nnwnnnwwn", T: "nnnnwnwwn",
  U: "wwnnnnnnw", V: "nwwnnnnnw", W: "wwwnnnnnn", X: "nwnnwnnnw", Y: "wwnnwnnnn",
  Z: "nwwnwnnnn", "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "*": "nwnnwnwnn",
};

const WIDE = 3;

/** True when every character of `text` can be encoded (digits, A–Z, "-", ".", space). */
export function code39Encodable(text: string): boolean {
  return text.length > 0 && [...text.toUpperCase()].every((c) => c !== "*" && c in CODE39);
}

/**
 * Bar widths in modules (narrow = 1), starting with a bar and alternating bar/space.
 * The text is wrapped in the "*" start/stop character; characters are separated by a narrow gap.
 */
export function code39Modules(text: string): number[] {
  const out: number[] = [];
  const chars = `*${text.toUpperCase()}*`;
  [...chars].forEach((c, i) => {
    for (const e of CODE39[c]!) out.push(e === "w" ? WIDE : 1);
    if (i < chars.length - 1) out.push(1);
  });
  return out;
}

/** Inline SVG for `text`, or null when it contains characters Code 39 cannot carry. */
export function code39Svg(text: string, opts: { moduleMm?: number; heightMm?: number } = {}): string | null {
  if (!code39Encodable(text)) return null;
  const moduleMm = opts.moduleMm ?? 0.25;
  const heightMm = opts.heightMm ?? 8;
  const modules = code39Modules(text);
  const total = modules.reduce((a, b) => a + b, 0);
  let x = 0;
  const rects: string[] = [];
  modules.forEach((w, i) => {
    if (i % 2 === 0) rects.push(`<rect x="${x}" y="0" width="${w}" height="1"/>`);
    x += w;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 1" preserveAspectRatio="none" width="${(total * moduleMm).toFixed(2)}mm" height="${heightMm}mm" shape-rendering="crispEdges">${rects.join("")}</svg>`;
}
