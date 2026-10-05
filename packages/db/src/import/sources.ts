import { parse } from "csv-parse/sync";
import {
  clean,
  parseBool,
  parsePacks,
  parseSystem,
  splitGenerics,
  splitStrength,
  type NormalizedProduct,
  type RowError,
} from "./normalize";

/** Fields of the standard medicine import format; admins map their file's headers onto these. */
export const MEDICINE_FIELDS = [
  { key: "brand_name", label: "Brand name", required: true },
  { key: "generic", label: "Generic(s), 'A + B' for combinations", required: true },
  { key: "dosage_form", label: "Dosage form", required: true },
  { key: "company", label: "Company / manufacturer", required: true },
  { key: "strength", label: "Strength", required: false },
  { key: "dar_number", label: "DAR number", required: false },
  { key: "medicine_system", label: "System (allopathic/herbal/...)", required: false },
  { key: "packs", label: "Packs & prices ('20's pack: 300; Unit Price: 15')", required: false },
  { key: "is_active", label: "Active (yes/no)", required: false },
  { key: "source_ref", label: "Source reference / id", required: false },
] as const;

export type MedicineFieldKey = (typeof MEDICINE_FIELDS)[number]["key"];
export type ColumnMapping = Partial<Record<MedicineFieldKey, string>>;

const HEADER_ALIASES: Record<MedicineFieldKey, string[]> = {
  brand_name: ["brand_name", "brand name", "brand", "trade name", "trade_name", "product name"],
  generic: ["generic", "generic name", "generic_name", "ingredients", "ingredient", "inn"],
  dosage_form: ["dosage_form", "dosage form", "form"],
  company: ["company", "manufacturer", "manufacturer name", "company name"],
  strength: ["strength"],
  dar_number: ["dar_number", "dar", "dar no", "dar number", "registration no", "reg no"],
  medicine_system: ["medicine_system", "type", "system"],
  packs: ["packs", "package container", "pack", "price", "pack size"],
  is_active: ["is_active", "active", "status"],
  source_ref: ["source_ref", "brand id", "id"],
};

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const rows = parse(text, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true, trim: true }) as Record<
    string,
    string
  >[];
  const headers = rows.length ? Object.keys(rows[0]!) : [];
  return { headers, rows };
}

/** Guess a mapping from file headers by common aliases. */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const field of MEDICINE_FIELDS) {
    const hit = headers.find((h) => HEADER_ALIASES[field.key].includes(h.trim().toLowerCase()));
    if (hit) mapping[field.key] = hit;
  }
  return mapping;
}

export function missingRequired(mapping: ColumnMapping): string[] {
  return MEDICINE_FIELDS.filter((f) => f.required && !mapping[f.key]).map((f) => f.label);
}

/** Convert mapped CSV rows to normalized products; invalid rows are reported, not thrown. */
export function rowsToProducts(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
): { products: NormalizedProduct[]; errors: RowError[] } {
  const products: NormalizedProduct[] = [];
  const errors: RowError[] = [];
  const get = (r: Record<string, string>, k: MedicineFieldKey) => (mapping[k] ? clean(r[mapping[k]!]) : "");

  rows.forEach((r, i) => {
    const row = i + 2; // header is line 1
    const brandName = get(r, "brand_name");
    const generics = splitGenerics(get(r, "generic"));
    const dosageForm = get(r, "dosage_form");
    const company = get(r, "company");
    const missing = [
      !brandName && "brand name",
      !generics.length && "generic",
      !dosageForm && "dosage form",
      !company && "company",
    ].filter(Boolean);
    if (missing.length) {
      errors.push({ row, message: `missing ${missing.join(", ")}` });
      return;
    }
    const strengthText = get(r, "strength") || undefined;
    const strengths = splitStrength(strengthText, generics.length);
    products.push({
      row,
      sourceRef: get(r, "source_ref") || undefined,
      brandName,
      dosageForm,
      company,
      strengthText,
      darNumber: get(r, "dar_number") || undefined,
      medicineSystem: parseSystem(get(r, "medicine_system")),
      ingredients: generics.map((g, idx) => ({ generic: g, ...(strengths[idx] ?? {}) })),
      packs: parsePacks(get(r, "packs")),
      isActive: parseBool(get(r, "is_active")),
    });
  });
  return { products, errors };
}

/** Generic-level metadata from the Kaggle/MedEx `generic.csv` (dev seed only). */
export interface GenericMeta {
  name: string;
  drugClass?: string;
  monograph: Record<string, string>;
}

const MONOGRAPH_COLUMNS: Record<string, string> = {
  indications: "indication description",
  dosage: "dosage description",
  administration: "administration description",
  contraindications: "contraindications description",
  sideEffects: "side effects description",
  interactions: "interaction description",
  pregnancyLactation: "pregnancy and lactation description",
  precautions: "precautions description",
  paediatricUse: "pediatric usage description",
};

export function parseMedexGenerics(text: string): GenericMeta[] {
  const { rows } = parseCsv(text);
  return rows
    .map((r) => {
      const monograph: Record<string, string> = {};
      for (const [k, col] of Object.entries(MONOGRAPH_COLUMNS)) if (r[col]) monograph[k] = r[col]!;
      return { name: clean(r["generic name"]), drugClass: clean(r["drug class"]) || undefined, monograph };
    })
    .filter((g) => g.name);
}
