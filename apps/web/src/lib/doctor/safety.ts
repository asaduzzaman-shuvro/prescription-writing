"use client";

import type { PrescriptionDoc } from "@rx/core";
import type { AbstractPowerSyncDatabase } from "@powersync/web";

export interface SafetyContext {
  allergies: string[];
  ageYears: number | null;
  weightKg: number | null;
}

/** Per-item warnings keyed by RxItem.id, plus prescription-level messages. */
export interface SafetyResult {
  byItem: Record<string, string[]>;
  general: string[];
}

interface ItemGenerics {
  itemId: string;
  label: string;
  generics: { id: string; name: string }[];
}

async function genericsFor(db: AbstractPowerSyncDatabase, doc: PrescriptionDoc): Promise<ItemGenerics[]> {
  const out: ItemGenerics[] = [];
  for (const it of doc.items) {
    const generics = it.productId
      ? await db.getAll<{ id: string; name: string }>(
          `SELECT g.id, g.name FROM product_ingredient pi JOIN generic g ON g.id = pi.generic_id WHERE pi.product_id = ? ORDER BY pi.position`,
          [it.productId],
        )
      : [];
    out.push({ itemId: it.id, label: it.brandName, generics });
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+(hydrochloride|hcl|sodium|potassium|trihydrate|dihydrate|monohydrate|besilate|maleate|citrate)\b/g, "").trim();

/**
 * Checks that run fully offline against the synced catalogue:
 *  - allergy match (patient allergy text vs generic/brand names)
 *  - the same generic prescribed twice under different brands
 *  - drug–drug interactions from the admin-curated interaction table
 *  - paediatric weight-based maximum daily dose, when the generic has a limit and weight is known
 */
export async function checkSafety(db: AbstractPowerSyncDatabase, doc: PrescriptionDoc, ctx: SafetyContext): Promise<SafetyResult> {
  const result: SafetyResult = { byItem: {}, general: [] };
  const add = (id: string, msg: string) => (result.byItem[id] ??= []).push(msg);
  const items = await genericsFor(db, doc);

  // Allergies
  const allergies = ctx.allergies.map(norm).filter(Boolean);
  for (const it of items) {
    for (const a of allergies) {
      const hit = it.generics.find((g) => norm(g.name).includes(a) || a.includes(norm(g.name))) ?? (norm(it.label).includes(a) ? { name: it.label } : null);
      if (hit) add(it.itemId, `Patient is allergic to ${a} (${hit.name})`);
    }
  }

  // Duplicate generics
  const seen = new Map<string, string>();
  for (const it of items) {
    for (const g of it.generics) {
      const prev = seen.get(g.id);
      if (prev && prev !== it.itemId) add(it.itemId, `Duplicate: ${g.name} is also in ${items.find((x) => x.itemId === prev)?.label}`);
      else seen.set(g.id, it.itemId);
    }
  }

  // Interactions (pairs stored once with generic_a < generic_b)
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
      const msg = `${r.severity.toUpperCase()} interaction with ${b.label}: ${r.effect}${r.management ? ` — ${r.management}` : ""}`;
      add(a.itemId, msg);
      add(b.itemId, `${r.severity.toUpperCase()} interaction with ${a.label}: ${r.effect}`);
    }
  }

  // Paediatric dose ceiling (single-ingredient products with mg strength)
  if (ctx.ageYears !== null && ctx.ageYears < 12) {
    if (!ctx.weightKg) result.general.push("Child patient: enter weight in O/E to enable dose checks");
    else {
      for (const it of doc.items) {
        if (!it.productId) continue;
        const row = await db.getOptional<{ name: string; paed_max_mg_per_kg_day: string | null; strength_value: string | null; strength_unit: string | null; basis: string | null; n: number }>(
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
        const daily = mgPerUnit * qty * perDay * (it.frequency.kind === "pattern" && it.doseQty && !["tab", "cap"].includes(it.doseUnit ?? "") ? it.doseQty : 1);
        const max = Number(row.paed_max_mg_per_kg_day) * ctx.weightKg;
        if (daily > max) add(it.id, `Dose ≈ ${Math.round(daily)} mg/day exceeds ${row.paed_max_mg_per_kg_day} mg/kg/day (${Math.round(max)} mg for ${ctx.weightKg} kg)`);
      }
    }
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
