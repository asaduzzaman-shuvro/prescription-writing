"use server";

import { applyPlan, buildPlan, guessMapping, loadSnapshot, missingRequired, parseCsv, rowsToProducts, type ColumnMapping, type PlannedRow } from "@rx/db/import";
import { revalidatePath } from "next/cache";
import { ownerDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export interface PreviewResult {
  error?: string;
  headers: string[];
  mapping: ColumnMapping;
  summary?: { total: number; new: number; changed: number; unchanged: number; conflict: number; errors: number };
  newCompanies?: string[];
  newForms?: string[];
  newGenerics?: string[];
  samples?: { kind: PlannedRow["kind"]; row: number; brand: string; detail: string }[];
  errors?: { row: number; message: string }[];
}

function describe(r: PlannedRow): string {
  const p = r.product;
  const base = `${p.dosageForm} · ${p.strengthText ?? ""} · ${p.ingredients.map((i) => i.generic).join(" + ")} · ${p.company}`;
  if (r.kind === "changed") return r.changes.map((c) => `${c.field}: "${c.from}" → "${c.to}"`).join("; ");
  if (r.kind === "conflict") return r.reason;
  return base;
}

export async function previewImport(csv: string, mapping: ColumnMapping | null): Promise<PreviewResult> {
  await requireAdmin();
  const { headers, rows } = parseCsv(csv);
  if (!rows.length) return { error: "The file has no data rows", headers, mapping: {} };
  const m = mapping ?? guessMapping(headers);
  const missing = missingRequired(m);
  if (missing.length) return { headers, mapping: m, error: `Map these required columns: ${missing.join(", ")}` };
  const { products, errors } = rowsToProducts(rows, m);
  const plan = buildPlan(products, errors, await loadSnapshot(ownerDb));
  const samples: PreviewResult["samples"] = [];
  for (const kind of ["conflict", "changed", "new"] as const) {
    for (const r of plan.rows.filter((x) => x.kind === kind).slice(0, 100)) {
      samples.push({ kind, row: r.product.row, brand: `${r.product.brandName}`, detail: describe(r) });
    }
  }
  return {
    headers,
    mapping: m,
    summary: plan.summary,
    newCompanies: plan.newCompanies,
    newForms: plan.newForms,
    newGenerics: plan.newGenerics,
    samples,
    errors: errors.slice(0, 100),
  };
}

export async function commitImport(csv: string, mapping: ColumnMapping, source: string, filename: string) {
  const session = await requireAdmin();
  const cleanSource = source.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  if (!cleanSource) return { error: "Enter a source label (e.g. dgda-2026-10, medex-licensed)" };
  const { rows } = parseCsv(csv);
  const { products, errors } = rowsToProducts(rows, mapping);
  const plan = buildPlan(products, errors, await loadSnapshot(ownerDb));
  const result = await applyPlan(ownerDb, plan, { source: cleanSource, filename, actorUserId: session.userId });
  revalidatePath("/admin");
  revalidatePath("/admin/medicines");
  return { result };
}
