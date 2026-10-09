import { LAB_CURATED_PANELS, LAB_CURATED_TESTS, labPanelRow, labTestRow } from "@rx/core";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import * as s from "../schema";

/**
 * Writes the curated lab catalogue (@rx/core LAB_CURATED_TESTS / LAB_CURATED_PANELS) as the platform rows.
 * Our own curated data, safe for any database, production included. Idempotent: new tests are added, changed
 * curated rows are updated (and re-sync to devices), rows the platform admin edited (source "admin") are left
 * alone, and nothing is ever deleted. Clinics' rows are never touched.
 */
export async function seedLabCatalogue(db: Db) {
  const counts = { added: 0, updated: 0, unchanged: 0, adminEdited: 0 };
  const stable = (v: unknown): string =>
    Array.isArray(v) ? `[${v.map(stable).join(",")}]`
    : v && typeof v === "object" ? `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`
    : JSON.stringify(v ?? null);

  const tests = await db.select().from(s.labTest).where(isNull(s.labTest.tenantId));
  const testByCode = new Map(tests.map((r) => [r.code, r]));
  for (const [i, t] of LAB_CURATED_TESTS.entries()) {
    const row = labTestRow(t, i);
    const cur = testByCode.get(row.code);
    if (!cur) {
      await db.insert(s.labTest).values({ ...row, source: "rx-curated" });
      counts.added++;
    } else if (cur.source !== "rx-curated") counts.adminEdited++;
    else if (stable({ ...row, isActive: true }) !== stable({ code: cur.code, name: cur.name, short: cur.short, unit: cur.unit, kind: cur.kind, department: cur.department, sortOrder: cur.sortOrder, spec: cur.spec, isActive: cur.isActive })) {
      await db.update(s.labTest).set({ ...row, isActive: true, updatedAt: sql`now()` }).where(and(eq(s.labTest.id, cur.id), isNull(s.labTest.tenantId)));
      counts.updated++;
    } else counts.unchanged++;
  }

  const panels = await db.select().from(s.labPanel).where(isNull(s.labPanel.tenantId));
  const panelByKey = new Map(panels.map((r) => [r.key, r]));
  for (const [i, p] of LAB_CURATED_PANELS.entries()) {
    const row = labPanelRow(p, i);
    const cur = panelByKey.get(row.key);
    if (!cur) {
      await db.insert(s.labPanel).values({ ...row, source: "rx-curated" });
      counts.added++;
    } else if (cur.source !== "rx-curated") counts.adminEdited++;
    else if (stable({ ...row, isActive: true }) !== stable({ key: cur.key, name: cur.name, department: cur.department, sortOrder: cur.sortOrder, spec: cur.spec, isActive: cur.isActive })) {
      await db.update(s.labPanel).set({ ...row, isActive: true, updatedAt: sql`now()` }).where(and(eq(s.labPanel.id, cur.id), isNull(s.labPanel.tenantId)));
      counts.updated++;
    } else counts.unchanged++;
  }
  return counts;
}
