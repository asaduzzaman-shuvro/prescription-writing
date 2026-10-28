"use client";

import type { PrescriptionDoc } from "@rx/core";
import type { AbstractPowerSyncDatabase } from "@powersync/web";

export type PregnancyStatus = "none" | "pregnant" | "lactating" | "both" | null;

export interface SafetyContext {
  allergies: string[];
  ageYears: number | null;
  weightKg: number | null;
  sex: "male" | "female" | "other" | null;
  pregnancyStatus: PregnancyStatus;
}

/** Per-item warnings keyed by RxItem.id, plus prescription-level messages. */
export interface SafetyResult {
  byItem: Record<string, string[]>;
  general: string[];
  /** Messages that must be cleared before finalise (client + server agree). */
  blockers: string[];
}

interface ItemGenerics {
  itemId: string;
  label: string;
  generics: { id: string; name: string; pregnancyCategory: string | null; adultMaxMgPerDay: string | null }[];
}

async function genericsFor(db: AbstractPowerSyncDatabase, doc: PrescriptionDoc): Promise<ItemGenerics[]> {
  const out: ItemGenerics[] = [];
  for (const it of doc.items) {
    type Row = { id: string; name: string; pregnancy_category: string | null; adult_max_mg_per_day: string | null };
    // A doctor-added medicine's generics come from its own row; the server's assertFinalizeSafety does the same.
    const generics = it.productId
      ? await db.getAll<Row>(
          `SELECT g.id, g.name, g.pregnancy_category, g.adult_max_mg_per_day
             FROM product_ingredient pi JOIN generic g ON g.id = pi.generic_id
            WHERE pi.product_id = ? ORDER BY pi.position`,
          [it.productId],
        )
      : it.customMedicineId
        ? await db.getAll<Row>(
            `SELECT g.id, g.name, g.pregnancy_category, g.adult_max_mg_per_day
               FROM custom_medicine cm, json_each(cm.generic_ids) j JOIN generic g ON g.id = j.value
              WHERE cm.id = ? ORDER BY j.key`,
            [it.customMedicineId],
          )
        : [];
    out.push({
      itemId: it.id,
      label: it.brandName,
      generics: generics.map((g) => ({
        id: g.id,
        name: g.name,
        pregnancyCategory: g.pregnancy_category,
        adultMaxMgPerDay: g.adult_max_mg_per_day,
      })),
    });
  }
  return out;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+(hydrochloride|hcl|sodium|potassium|trihydrate|dihydrate|monohydrate|besilate|maleate|citrate)\b/g, "")
    .trim();

function pregCat(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase().replace(/^CATEGORY\s+/, "");
}

/**
 * Checks that run fully offline against the synced catalogue:
 *  - allergy match (patient allergy text vs generic/brand names) — blocker
 *  - the same generic prescribed twice under different brands
 *  - drug–drug interactions; contraindicated is a blocker
 *  - paediatric weight-based maximum daily dose
 *  - adult max mg/day when set on the generic
 *  - pregnancy category D/X when the patient is pregnant (blocker for X/D)
 */
export async function checkSafety(db: AbstractPowerSyncDatabase, doc: PrescriptionDoc, ctx: SafetyContext): Promise<SafetyResult> {
  const result: SafetyResult = { byItem: {}, general: [], blockers: [] };
  const add = (id: string, msg: string, block = false) => {
    (result.byItem[id] ??= []).push(msg);
    if (block) result.blockers.push(msg);
  };
  const items = await genericsFor(db, doc);

  const allergies = ctx.allergies.map(norm).filter(Boolean);
  for (const it of items) {
    for (const a of allergies) {
      const hit =
        it.generics.find((g) => norm(g.name).includes(a) || a.includes(norm(g.name))) ??
        (norm(it.label).includes(a) ? { name: it.label } : null);
      if (hit) add(it.itemId, `Patient is allergic to ${a} (${hit.name})`, true);
    }
  }

  const seen = new Map<string, string>();
  for (const it of items) {
    for (const g of it.generics) {
      const prev = seen.get(g.id);
      if (prev && prev !== it.itemId) add(it.itemId, `Duplicate: ${g.name} is also in ${items.find((x) => x.itemId === prev)?.label}`);
      else seen.set(g.id, it.itemId);
    }
  }

  const ids = [...new Set(items.flatMap((i) => i.generics.map((g) => g.id)))];
  if (ids.length > 1) {
    const ph = ids.map(() => "?").join(",");
    const rows = await db.getAll<{ generic_a: string; generic_b: string; severity: string; effect: string; management: string | null }>(
      `SELECT generic_a, generic_b, severity, effect, management FROM generic_interaction WHERE generic_a IN (${ph}) AND generic_b IN (${ph})`,
      [...ids, ...ids],
    );
    for (const r of rows) {
      const a = items.find((i) => i.generics.some((g) => g.id === r.generic_a));
      const b = items.find((i) => i.generics.some((g) => g.id === r.generic_b));
      if (!a || !b || a.itemId === b.itemId) continue;
      const block = r.severity.toLowerCase() === "contraindicated";
      const msg = `${r.severity.toUpperCase()} interaction with ${b.label}: ${r.effect}${r.management ? ` — ${r.management}` : ""}`;
      add(a.itemId, msg, block);
      add(b.itemId, `${r.severity.toUpperCase()} interaction with ${a.label}: ${r.effect}`, block);
    }
  }

  if (ctx.ageYears !== null && ctx.ageYears < 12) {
    if (!ctx.weightKg) result.general.push("Child patient: enter weight in O/E to enable dose checks");
    else {
      for (const it of doc.items) {
        if (!it.productId) continue;
        const row = await db.getOptional<{
          name: string;
          paed_max_mg_per_kg_day: string | null;
          strength_value: string | null;
          strength_unit: string | null;
          basis: string | null;
          n: number;
        }>(
          `SELECT g.name, g.paed_max_mg_per_kg_day, pi.strength_value, pi.strength_unit, pi.basis,
                  (SELECT count(*) FROM product_ingredient x WHERE x.product_id = pi.product_id) AS n
             FROM product_ingredient pi JOIN generic g ON g.id = pi.generic_id WHERE pi.product_id = ? ORDER BY pi.position LIMIT 1`,
          [it.productId],
        );
        if (!row || row.n !== 1 || !row.paed_max_mg_per_kg_day || !row.strength_value || row.strength_unit?.toLowerCase() !== "mg") continue;
        const mgPerUnit = mgPerDoseUnit(Number(row.strength_value), row.basis, it.doseUnit);
        const perDay = dosesPerDay(it);
        if (mgPerUnit === null || perDay === null) continue;
        const qty = it.frequency.kind === "pattern" ? 1 : (it.doseQty ?? 1);
        const daily =
          mgPerUnit * qty * perDay * (it.frequency.kind === "pattern" && it.doseQty && !["tab", "cap"].includes(it.doseUnit ?? "") ? it.doseQty : 1);
        const max = Number(row.paed_max_mg_per_kg_day) * ctx.weightKg;
        if (daily > max)
          add(it.id, `Dose ≈ ${Math.round(daily)} mg/day exceeds ${row.paed_max_mg_per_kg_day} mg/kg/day (${Math.round(max)} mg for ${ctx.weightKg} kg)`);
      }
    }
  }

  // Adult max mg/day (single-ingredient mg products, age ≥ 12)
  if (ctx.ageYears === null || ctx.ageYears >= 12) {
    for (const it of doc.items) {
      if (!it.productId) continue;
      const row = await db.getOptional<{
        name: string;
        adult_max_mg_per_day: string | null;
        strength_value: string | null;
        strength_unit: string | null;
        basis: string | null;
        n: number;
      }>(
        `SELECT g.name, g.adult_max_mg_per_day, pi.strength_value, pi.strength_unit, pi.basis,
                (SELECT count(*) FROM product_ingredient x WHERE x.product_id = pi.product_id) AS n
           FROM product_ingredient pi JOIN generic g ON g.id = pi.generic_id WHERE pi.product_id = ? ORDER BY pi.position LIMIT 1`,
        [it.productId],
      );
      if (!row || row.n !== 1 || !row.adult_max_mg_per_day || !row.strength_value || row.strength_unit?.toLowerCase() !== "mg") continue;
      const mgPerUnit = mgPerDoseUnit(Number(row.strength_value), row.basis, it.doseUnit);
      const perDay = dosesPerDay(it);
      if (mgPerUnit === null || perDay === null) continue;
      const qty = it.frequency.kind === "pattern" ? 1 : (it.doseQty ?? 1);
      const daily =
        mgPerUnit * qty * perDay * (it.frequency.kind === "pattern" && it.doseQty && !["tab", "cap"].includes(it.doseUnit ?? "") ? it.doseQty : 1);
      const max = Number(row.adult_max_mg_per_day);
      if (daily > max) add(it.id, `Dose ≈ ${Math.round(daily)} mg/day exceeds adult max ${max} mg/day (${row.name})`);
    }
  }

  const pregnant = ctx.pregnancyStatus === "pregnant" || ctx.pregnancyStatus === "both";
  const lactating = ctx.pregnancyStatus === "lactating" || ctx.pregnancyStatus === "both";
  if ((pregnant || lactating) && (ctx.sex === "female" || ctx.sex === null)) {
    for (const it of items) {
      for (const g of it.generics) {
        const cat = pregCat(g.pregnancyCategory);
        if (!cat) continue;
        if (pregnant && (cat === "X" || cat === "D")) {
          add(it.itemId, `Pregnancy category ${cat}: ${g.name} — avoid in pregnancy`, true);
        } else if (pregnant && (cat === "C" || cat === "B")) {
          add(it.itemId, `Pregnancy category ${cat}: ${g.name} — use only if clearly needed`);
        } else if (lactating && (cat === "X" || cat === "L5" || cat.includes("CONTRA"))) {
          add(it.itemId, `Lactation risk: ${g.name} (category ${cat})`, true);
        }
      }
    }
  } else if ((ctx.sex === "female" || ctx.sex === null) && !ctx.pregnancyStatus && items.some((i) => i.generics.some((g) => ["D", "X"].includes(pregCat(g.pregnancyCategory))))) {
    result.general.push("Set pregnancy/lactation status on the patient record to enable pregnancy-category checks");
  }

  return result;
}

function mgPerDoseUnit(strengthMg: number, basis: string | null, unit: string | undefined): number | null {
  if (!basis) return unit === "tab" || unit === "cap" || unit === undefined ? strengthMg : null;
  const m = /^([\d.]+)\s*ml$/i.exec(basis.trim());
  if (!m) return null;
  const perMl = strengthMg / Number(m[1]);
  if (unit === "tsf") return perMl * 5;
  if (unit === "ml") return perMl;
  return null;
}

function dosesPerDay(it: PrescriptionDoc["items"][number]): number | null {
  const f = it.frequency;
  if (f.kind === "pattern") return f.slots.reduce((a, b) => a + b, 0);
  if (f.kind === "times_per_day") return f.times;
  if (f.kind === "every_hours") return Math.floor(24 / f.hours);
  return null;
}
