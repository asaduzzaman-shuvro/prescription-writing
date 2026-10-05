/**
 * Dry-run diff of an import against the current catalogue. Pure function over a snapshot, so the
 * admin UI can preview exactly what a commit would do.
 */
import { clean, productKey, type NormalizedPack, type NormalizedProduct, type RowError } from "./normalize";

export interface SnapshotProduct {
  id: string;
  brandName: string;
  formName: string;
  companyName: string;
  strengthText: string | null;
  darNumber: string | null;
  medicineSystem: string;
  isActive: boolean;
  genericText: string;
  packs: { description: string; mrp: number | null }[];
}

export interface CatalogueSnapshot {
  companies: Map<string, string>; // lower(name) -> id
  forms: Map<string, string>;
  generics: Map<string, string>;
  products: SnapshotProduct[];
}

export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

export type PlannedRow =
  | { kind: "new"; product: NormalizedProduct }
  | { kind: "changed"; product: NormalizedProduct; existingId: string; changes: FieldChange[] }
  | { kind: "unchanged"; product: NormalizedProduct; existingId: string }
  | { kind: "conflict"; product: NormalizedProduct; reason: string; existingId?: string };

export interface ImportPlan {
  rows: PlannedRow[];
  errors: RowError[];
  newCompanies: string[];
  newForms: string[];
  newGenerics: string[];
  summary: { total: number; new: number; changed: number; unchanged: number; conflict: number; errors: number };
}

const lower = (s: string) => clean(s).toLowerCase();

export const genericTextOf = (p: Pick<NormalizedProduct, "ingredients">) => p.ingredients.map((i) => i.generic).join(" + ");

const packsText = (packs: { description: string; mrp?: number | null }[]) =>
  packs
    .map((p) => `${p.description}: ${p.mrp ?? "-"}`)
    .sort()
    .join("; ");

export function buildPlan(products: NormalizedProduct[], errors: RowError[], snap: CatalogueSnapshot): ImportPlan {
  const byDar = new Map<string, SnapshotProduct>();
  const byKey = new Map<string, SnapshotProduct[]>();
  for (const p of snap.products) {
    if (p.darNumber) byDar.set(lower(p.darNumber), p);
    const k = productKey({ company: p.companyName, brandName: p.brandName, dosageForm: p.formName, strengthText: p.strengthText ?? "" });
    byKey.set(k, [...(byKey.get(k) ?? []), p]);
  }

  const seenInFile = new Map<string, number>();
  const newCompanies = new Map<string, string>();
  const newForms = new Map<string, string>();
  const newGenerics = new Map<string, string>();
  const rows: PlannedRow[] = [];

  for (const product of products) {
    const key = productKey(product);
    const dar = product.darNumber ? lower(product.darNumber) : undefined;
    const fileKey = dar ? `dar:${dar}` : `key:${key}`;
    const firstRow = seenInFile.get(fileKey);
    if (firstRow !== undefined) {
      rows.push({ kind: "conflict", product, reason: `duplicate of row ${firstRow} in this file` });
      continue;
    }
    seenInFile.set(fileKey, product.row);

    let existing: SnapshotProduct | undefined;
    if (dar && byDar.has(dar)) {
      existing = byDar.get(dar)!;
      if (lower(existing.brandName) !== lower(product.brandName)) {
        rows.push({
          kind: "conflict",
          product,
          existingId: existing.id,
          reason: `DAR ${product.darNumber} already belongs to "${existing.brandName}"`,
        });
        continue;
      }
    } else {
      const matches = byKey.get(key) ?? [];
      if (matches.length > 1) {
        rows.push({ kind: "conflict", product, reason: `matches ${matches.length} existing products` });
        continue;
      }
      existing = matches[0];
      if (existing && dar && existing.darNumber && lower(existing.darNumber) !== dar) {
        rows.push({
          kind: "conflict",
          product,
          existingId: existing.id,
          reason: `existing product has DAR ${existing.darNumber}, file says ${product.darNumber}`,
        });
        continue;
      }
    }

    // Track reference data that will be created.
    if (!snap.companies.has(lower(product.company))) newCompanies.set(lower(product.company), product.company);
    if (!snap.forms.has(lower(product.dosageForm))) newForms.set(lower(product.dosageForm), product.dosageForm);
    for (const ing of product.ingredients)
      if (!snap.generics.has(lower(ing.generic))) newGenerics.set(lower(ing.generic), ing.generic);

    if (!existing) {
      rows.push({ kind: "new", product });
      continue;
    }

    const changes = diffProduct(existing, product);
    rows.push(
      changes.length
        ? { kind: "changed", product, existingId: existing.id, changes }
        : { kind: "unchanged", product, existingId: existing.id },
    );
  }

  const count = (k: PlannedRow["kind"]) => rows.filter((r) => r.kind === k).length;
  return {
    rows,
    errors,
    newCompanies: [...newCompanies.values()].sort(),
    newForms: [...newForms.values()].sort(),
    newGenerics: [...newGenerics.values()].sort(),
    summary: {
      total: products.length + errors.length,
      new: count("new"),
      changed: count("changed"),
      unchanged: count("unchanged"),
      conflict: count("conflict"),
      errors: errors.length,
    },
  };
}

function diffProduct(e: SnapshotProduct, p: NormalizedProduct): FieldChange[] {
  const changes: FieldChange[] = [];
  const cmp = (field: string, from: string, to: string, ci = false) => {
    if ((ci ? from.toLowerCase() : from) !== (ci ? to.toLowerCase() : to)) changes.push({ field, from, to });
  };
  cmp("brandName", e.brandName, p.brandName);
  cmp("company", e.companyName, p.company, true);
  cmp("dosageForm", e.formName, p.dosageForm, true);
  cmp("strength", e.strengthText ?? "", p.strengthText ?? "");
  if (p.darNumber) cmp("darNumber", e.darNumber ?? "", p.darNumber);
  cmp("medicineSystem", e.medicineSystem, p.medicineSystem);
  cmp("isActive", String(e.isActive), String(p.isActive));
  cmp("generics", e.genericText, genericTextOf(p), true);
  if (p.packs.length) cmp("packs", packsText(e.packs), packsText(p.packs as NormalizedPack[]));
  return changes;
}
