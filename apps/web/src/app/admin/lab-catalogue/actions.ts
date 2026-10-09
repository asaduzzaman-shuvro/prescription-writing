"use server";

import { cleanLabPanelSpec, cleanLabTestSpec, labCatalogueRowProblem } from "@rx/core";
import { s } from "@rx/db";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { ownerDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

const back = (table: string, code: string, error: string) => redirect(`/admin/lab-catalogue/${table}/${encodeURIComponent(code)}?error=${encodeURIComponent(error)}`);

/**
 * Saves a platform test or panel. It is marked source "admin", so `pnpm db:seed:labs` no longer updates it.
 * A code or key is permanent: results are stored under it.
 */
export async function saveLabCatalogueEntry(form: FormData) {
  const session = await requireAdmin();
  const table = String(form.get("table")) === "panels" ? "panels" : "tests";
  const isNew = form.get("isNew") === "1";
  const code = String(form.get("code") ?? "").trim();
  const text = (k: string) => String(form.get(k) ?? "").trim() || null;
  const sortOrder = Number(form.get("sortOrder"));
  let spec: unknown;
  try {
    spec = JSON.parse(String(form.get("spec") || "{}"));
  } catch (e) {
    back(table, isNew ? "new" : code, `Spec is not valid JSON: ${(e as Error).message}`);
  }
  const row = table === "tests"
    ? { code, name: text("name"), short: text("short"), unit: text("unit") ?? "", kind: text("kind"), department: text("department"), spec }
    : { key: code, name: text("name"), department: text("department"), spec };
  const problem = labCatalogueRowProblem(table === "tests" ? "lab_test" : "lab_panel", row)
    ?? (!code ? "A code is required" : null)
    ?? (!row.name ? "A name is required" : null)
    ?? (table === "tests" && (!("short" in row) || !row.short || !row.kind) ? "A test needs a short name and a kind" : null)
    ?? (!row.department ? "A department is required" : null);
  if (problem) back(table, isNew ? "new" : code, problem);

  const values = {
    name: row.name,
    department: row.department,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : null,
    isActive: form.get("isActive") === "on",
    source: "admin",
    updatedBy: session.userId,
    updatedAt: new Date(),
  };
  let before: unknown;
  if (table === "tests") {
    const t = row as { short: string | null; unit: string; kind: string | null };
    const v = { ...values, short: t.short, unit: t.unit, kind: t.kind, spec: cleanLabTestSpec(spec) };
    const [old] = await ownerDb.select().from(s.labTest).where(and(eq(s.labTest.code, code), isNull(s.labTest.tenantId)));
    if (isNew && old) back(table, "new", `${code} already exists`);
    if (!isNew && !old) back(table, code, `${code} isn't in the catalogue`);
    before = old;
    if (old) await ownerDb.update(s.labTest).set(v).where(eq(s.labTest.id, old.id));
    else await ownerDb.insert(s.labTest).values({ ...v, code, tenantId: null });
  } else {
    const v = { ...values, spec: cleanLabPanelSpec(spec) };
    const [old] = await ownerDb.select().from(s.labPanel).where(and(eq(s.labPanel.key, code), isNull(s.labPanel.tenantId)));
    if (isNew && old) back(table, "new", `${code} already exists`);
    if (!isNew && !old) back(table, code, `${code} isn't in the catalogue`);
    before = old;
    if (old) await ownerDb.update(s.labPanel).set(v).where(eq(s.labPanel.id, old.id));
    else await ownerDb.insert(s.labPanel).values({ ...v, key: code, tenantId: null });
  }
  await audit({ actorUserId: session.userId, action: `lab_${table === "tests" ? "test" : "panel"}.${isNew ? "create" : "update"}`, entity: table === "tests" ? "lab_test" : "lab_panel", entityId: code, before, after: row });
  revalidatePath("/admin/lab-catalogue");
  redirect(`/admin/lab-catalogue/${table}/${encodeURIComponent(code)}?saved=1`);
}
