/**
 * Source-independent shape for one medicine product row, plus parsing helpers shared by all
 * import sources (dev Kaggle seed, admin CSV uploads, future licensed feeds).
 */

export type MedicineSystem = "allopathic" | "herbal" | "ayurvedic" | "unani" | "homeopathic";

export interface NormalizedIngredient {
  generic: string;
  strengthValue?: number;
  strengthUnit?: string;
  basis?: string;
}

export interface NormalizedPack {
  description: string;
  packSize?: string;
  mrp?: number;
}

export interface NormalizedProduct {
  /** 1-based row number in the source file, for error reporting. */
  row: number;
  sourceRef?: string;
  brandName: string;
  dosageForm: string;
  company: string;
  strengthText?: string;
  darNumber?: string;
  medicineSystem: MedicineSystem;
  ingredients: NormalizedIngredient[];
  packs: NormalizedPack[];
  isActive: boolean;
}

export interface RowError {
  row: number;
  message: string;
}

export const clean = (s: string | undefined | null): string => (s ?? "").replace(/\s+/g, " ").trim();

/** "Paracetamol + Caffeine" -> ["Paracetamol", "Caffeine"]. */
export function splitGenerics(text: string): string[] {
  return clean(text)
    .split(/\s*\+\s*/)
    .map(clean)
    .filter(Boolean);
}

/**
 * Split a strength string into per-ingredient values.
 * "500 mg" -> [{500,mg}]; "20 mg+500 mg" -> two; "(10 mg+30 mg)/5 ml" -> basis "5 ml".
 * Returns [] when the parts don't line up with the ingredient count.
 */
export function splitStrength(text: string | undefined, count: number): Omit<NormalizedIngredient, "generic">[] {
  const s = clean(text);
  if (!s) return [];
  let body = s;
  let basis: string | undefined;
  const m = /^\((.+)\)\s*\/\s*(.+)$/.exec(s);
  if (m) {
    body = m[1]!;
    basis = clean(m[2]);
  } else if (count === 1) {
    const one = /^(.+?)\s*\/\s*(\d.*)$/.exec(s);
    if (one) {
      body = one[1]!;
      basis = clean(one[2]);
    }
  }
  const parts = body.split("+").map(clean);
  if (parts.length !== count) return [];
  return parts.map((p) => {
    const v = /^([\d.,]+)\s*(.*)$/.exec(p);
    if (!v) return { basis };
    const value = Number(v[1]!.replace(/,/g, ""));
    return {
      strengthValue: Number.isFinite(value) ? value : undefined,
      strengthUnit: clean(v[2]) || undefined,
      basis,
    };
  });
}

/**
 * Parse MedEx-style pack text: "Unit Price: ৳ 15.00,(20's pack: ৳ 300.00)," or "100 ml bottle: ৳ 40.12".
 * Also accepts "desc: price; desc: price" from admin CSVs.
 */
export function parsePacks(text: string | undefined): NormalizedPack[] {
  const s = clean(text);
  if (!s) return [];
  const out: NormalizedPack[] = [];
  const re = /\(?\s*([^,;():]+?)\s*:\s*(?:৳|Tk\.?|BDT)?\s*([\d,]+(?:\.\d+)?)\s*\)?/gi;
  for (const m of s.matchAll(re)) {
    const description = clean(m[1]);
    const mrp = Number(m[2]!.replace(/,/g, ""));
    if (!description) continue;
    const size = /^(\d+)'s pack$/i.exec(description)?.[1] ?? /^(\d+\s*(?:ml|gm|g|mg|tablet|capsule)s?)\b/i.exec(description)?.[1];
    out.push({ description, packSize: size ? clean(size) : undefined, mrp: Number.isFinite(mrp) ? mrp : undefined });
  }
  return out;
}

const norm = (s: string | undefined) => clean(s).toLowerCase();
const normStrength = (s: string | undefined) => norm(s).replace(/\s+/g, "");

/** Natural key used when a row has no DAR number. */
export function productKey(p: { company: string; brandName: string; dosageForm: string; strengthText?: string }): string {
  return [norm(p.company), norm(p.brandName), norm(p.dosageForm), normStrength(p.strengthText)].join("|");
}

export function parseSystem(text: string | undefined): MedicineSystem {
  const s = norm(text);
  if (s === "herbal" || s === "ayurvedic" || s === "unani" || s === "homeopathic") return s;
  return "allopathic";
}

export function parseBool(text: string | undefined, fallback = true): boolean {
  const s = norm(text);
  if (!s) return fallback;
  return !["0", "false", "no", "n", "inactive", "discontinued"].includes(s);
}
