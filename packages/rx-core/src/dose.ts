import { digits, toEnDigits, type Numerals } from "./bangla";
import type { DoseUnit, Duration, DurationUnit, Frequency, Route, RxItem, Side, Timing } from "./types";

export type Lang = "bn" | "en";

// ---------------------------------------------------------------------------
// Parsing doctor shortcuts
// ---------------------------------------------------------------------------

const FRACTIONS: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75 };

function parseSlot(raw: string): number | null {
  const s = raw.trim();
  if (s in FRACTIONS) return FRACTIONS[s]!;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^\d+\/\d+$/.test(s)) {
    const [a, b] = s.split("/").map(Number);
    return b ? a! / b : null;
  }
  return null;
}

/** Parse "1+0+1", "½+0+½", "1+1+1+1", "০+০+১" into a slot pattern. */
export function parsePattern(input: string): number[] | null {
  const s = toEnDigits(input).replace(/\s+/g, "");
  if (!/^[\d½¼¾./]+(\+[\d½¼¾./]+){2,3}$/.test(s)) return null;
  const slots = s.split("+").map(parseSlot);
  return slots.every((n): n is number => n !== null) ? slots : null;
}

const DURATION_UNITS: Record<string, DurationUnit> = { d: "day", w: "week", m: "month" };

/** Parse "5d", "2w", "1m", "cont"/"c" into a duration. */
export function parseDuration(input: string): Duration | null {
  const s = toEnDigits(input).trim().toLowerCase();
  if (s === "c" || s === "cont" || s === "continue" || s === "চলবে") return { kind: "continue" };
  const m = /^(\d+)\s*([dwm])$/.exec(s);
  if (!m) return null;
  return { kind: "fixed", value: Number(m[1]), unit: DURATION_UNITS[m[2]!]! };
}

const TIMING_CODES: Record<string, Timing> = {
  af: "after_food",
  pc: "after_food",
  bf: "before_food",
  ac: "before_food",
  wf: "with_food",
  es: "empty_stomach",
  hs: "bedtime",
};

/** Parse "af", "bf", "es", "hs" timing codes. */
export function parseTiming(input: string): Timing | null {
  return TIMING_CODES[input.trim().toLowerCase()] ?? null;
}

const FREQ_CODES: Record<string, Frequency> = {
  od: { kind: "times_per_day", times: 1 },
  bd: { kind: "times_per_day", times: 2 },
  bid: { kind: "times_per_day", times: 2 },
  tds: { kind: "times_per_day", times: 3 },
  tid: { kind: "times_per_day", times: 3 },
  qds: { kind: "times_per_day", times: 4 },
  qid: { kind: "times_per_day", times: 4 },
  sos: { kind: "sos" },
  prn: { kind: "sos" },
  stat: { kind: "stat" },
};

const SIDE_CODES: Record<string, Side> = { r: "right", re: "right", l: "left", le: "left", b: "both", be: "both" };

const UNIT_CODES: Record<string, DoseUnit> = {
  drop: "drop",
  drops: "drop",
  gtt: "drop",
  puff: "puff",
  puffs: "puff",
  spray: "spray",
  sprays: "spray",
  tsf: "tsf",
  ml: "ml",
  tab: "tab",
  cap: "cap",
  sachet: "sachet",
};

export interface ParsedShortcut {
  frequency?: Frequency;
  duration?: Duration;
  timing?: Timing;
  doseQty?: number;
  doseUnit?: DoseUnit;
  side?: Side;
}

/**
 * Parse a whole shortcut line typed by the doctor, e.g.
 *   "1+0+1 af 7d"          -> pattern [1,0,1], after food, 7 days
 *   "2 drop tds re 5d"     -> 2 drops, 3 times daily, right ear, 5 days
 *   "0+0+1 hs cont"        -> night, bedtime, continue
 * Unrecognised tokens are ignored and returned in `unknown`.
 */
export function parseShortcut(input: string): ParsedShortcut & { unknown: string[] } {
  const out: ParsedShortcut & { unknown: string[] } = { unknown: [] };
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    const lower = toEnDigits(tok).toLowerCase();
    const pattern = parsePattern(tok);
    if (pattern) {
      out.frequency = { kind: "pattern", slots: pattern };
      continue;
    }
    const dur = parseDuration(tok);
    if (dur) {
      out.duration = dur;
      continue;
    }
    const timing = parseTiming(lower);
    if (timing) {
      out.timing = timing;
      continue;
    }
    if (lower in FREQ_CODES) {
      out.frequency = FREQ_CODES[lower];
      continue;
    }
    const q6 = /^q(\d+)h$/.exec(lower);
    if (q6) {
      out.frequency = { kind: "every_hours", hours: Number(q6[1]) };
      continue;
    }
    if (lower in SIDE_CODES) {
      out.side = SIDE_CODES[lower];
      continue;
    }
    if (/^\d+(\.\d+)?$/.test(lower) && tokens[i + 1] && toEnDigits(tokens[i + 1]!).toLowerCase() in UNIT_CODES) {
      out.doseQty = Number(lower);
      out.doseUnit = UNIT_CODES[toEnDigits(tokens[i + 1]!).toLowerCase()];
      i++;
      continue;
    }
    if (lower in UNIT_CODES) {
      out.doseUnit = UNIT_CODES[lower];
      continue;
    }
    out.unknown.push(tok);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Formatting for print
// ---------------------------------------------------------------------------

const TIMING_TEXT: Record<Lang, Record<Timing, string>> = {
  bn: {
    after_food: "খাবারের পরে",
    before_food: "খাবারের আগে",
    with_food: "খাবারের সাথে",
    empty_stomach: "খালি পেটে",
    bedtime: "ঘুমানোর আগে",
    none: "",
  },
  en: {
    after_food: "after meal",
    before_food: "before meal",
    with_food: "with meal",
    empty_stomach: "on empty stomach",
    bedtime: "at bedtime",
    none: "",
  },
};

const DURATION_UNIT_TEXT: Record<Lang, Record<DurationUnit, string>> = {
  bn: { day: "দিন", week: "সপ্তাহ", month: "মাস" },
  en: { day: "day", week: "week", month: "month" },
};

const UNIT_TEXT: Record<Lang, Record<DoseUnit, string>> = {
  bn: {
    tab: "টি",
    cap: "টি",
    tsf: "চামচ",
    ml: "মি.লি.",
    drop: "ফোঁটা",
    puff: "চাপ",
    spray: "স্প্রে",
    sachet: "স্যাশে",
    amp: "অ্যাম্পুল",
    vial: "ভায়াল",
    supp: "টি",
    application: "বার লাগাবেন",
    unit: "ইউনিট",
  },
  en: {
    tab: "tab",
    cap: "cap",
    tsf: "tsf",
    ml: "ml",
    drop: "drop(s)",
    puff: "puff(s)",
    spray: "spray(s)",
    sachet: "sachet",
    amp: "amp",
    vial: "vial",
    supp: "supp",
    application: "application",
    unit: "unit(s)",
  },
};

const SIDE_TEXT: Record<Lang, Partial<Record<Route, Record<Side, string>>>> = {
  bn: {
    ear: { right: "ডান কানে", left: "বাম কানে", both: "উভয় কানে" },
    nose: { right: "নাকের ডান ছিদ্রে", left: "নাকের বাম ছিদ্রে", both: "নাকের উভয় ছিদ্রে" },
    eye: { right: "ডান চোখে", left: "বাম চোখে", both: "উভয় চোখে" },
  },
  en: {
    ear: { right: "right ear", left: "left ear", both: "both ears" },
    nose: { right: "right nostril", left: "left nostril", both: "both nostrils" },
    eye: { right: "right eye", left: "left eye", both: "both eyes" },
  },
};

function formatNumber(n: number, numerals: Numerals): string {
  if (n === 0.5) return "½";
  if (n === 0.25) return "¼";
  if (n === 0.75) return "¾";
  if (n % 1 === 0.5) return `${digits(Math.floor(n), numerals)}½`;
  return digits(n, numerals);
}

/** "1+0+1" style dose; for non tab/cap units with a qty, prefixes "2 tsf: 1+0+1". */
export function formatFrequency(item: Pick<RxItem, "frequency" | "doseQty" | "doseUnit">, lang: Lang, numerals: Numerals): string {
  const f = item.frequency;
  const qty =
    item.doseQty && item.doseUnit ? `${formatNumber(item.doseQty, numerals)} ${UNIT_TEXT[lang][item.doseUnit]}` : "";
  const each = lang === "bn" ? " করে" : "";
  switch (f.kind) {
    case "pattern": {
      const pat = f.slots.map((s) => formatNumber(s, numerals)).join("+");
      return qty && item.doseUnit !== "tab" && item.doseUnit !== "cap" ? `${qty}${each} (${pat})` : pat;
    }
    case "times_per_day":
      return lang === "bn"
        ? `${qty ? qty + each + " " : ""}দিনে ${digits(f.times, numerals)} বার`
        : `${qty ? qty + " " : ""}${f.times} time${f.times > 1 ? "s" : ""} daily`;
    case "every_hours":
      return lang === "bn"
        ? `${qty ? qty + each + " " : ""}${digits(f.hours, numerals)} ঘণ্টা পর পর`
        : `${qty ? qty + " " : ""}every ${f.hours} hours`;
    case "weekly":
      return lang === "bn"
        ? `${qty ? qty + each + " " : ""}সপ্তাহে ${digits(f.times, numerals)} বার`
        : `${qty ? qty + " " : ""}${f.times} time${f.times > 1 ? "s" : ""} weekly`;
    case "sos":
      return lang === "bn" ? `${qty ? qty + " " : ""}প্রয়োজনে` : `${qty ? qty + " " : ""}when needed`;
    case "stat":
      return lang === "bn" ? `${qty ? qty + " " : ""}এখনই একবার` : `${qty ? qty + " " : ""}once, immediately`;
  }
}

export function formatDuration(d: Duration, lang: Lang, numerals: Numerals): string {
  switch (d.kind) {
    case "none":
      return "";
    case "continue":
      return lang === "bn" ? "চলবে" : "continue";
    case "fixed": {
      const unit = DURATION_UNIT_TEXT[lang][d.unit];
      return lang === "en" && d.value > 1 ? `${d.value} ${unit}s` : `${digits(d.value, numerals)} ${unit}`;
    }
  }
}

export function formatTiming(t: Timing | undefined, lang: Lang): string {
  return t ? TIMING_TEXT[lang][t] : "";
}

export function formatSide(route: Route | undefined, side: Side | undefined, lang: Lang): string {
  if (!route || !side) return "";
  return SIDE_TEXT[lang][route]?.[side] ?? "";
}

/** Full instruction line, e.g. "১+০+১ — খাবারের পরে — ৭ দিন". */
export function formatInstruction(item: RxItem, lang: Lang, numerals: Numerals): string {
  const { main, duration } = formatInstructionParts(item, lang, numerals);
  return [main, duration].filter(Boolean).join(" — ");
}

/** The instruction split for print: `main` ("১+০+১ — খাবারের পরে") and the duration ("৭ দিন") for its own column. */
export function formatInstructionParts(item: RxItem, lang: Lang, numerals: Numerals): { main: string; duration: string } {
  const main = [formatFrequency(item, lang, numerals), formatSide(item.route, item.side, lang), formatTiming(item.timing, lang)]
    .filter(Boolean)
    .join(" — ");
  return { main, duration: formatDuration(item.duration, lang, numerals) };
}

/** Body-mass index rounded to one decimal, or null when inputs are missing. */
export function bmi(weightKg?: number, heightCm?: number): number | null {
  if (!weightKg || !heightCm) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}
