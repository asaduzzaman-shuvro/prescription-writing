"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { ownerDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { isLibraryKind, LIBRARIES } from "./config";

function valuesFrom(kind: keyof typeof LIBRARIES, form: FormData) {
  const v: Record<string, string | null> = {};
  for (const f of LIBRARIES[kind].fields) v[f.key] = String(form.get(f.key) ?? "").trim() || null;
  const spec = String(form.get("specialtyCode") ?? "");
  v.specialtyCode = spec || null;
  return v;
}

export async function saveLibraryItem(form: FormData) {
  const session = await requireAdmin();
  const kind = String(form.get("kind"));
  if (!isLibraryKind(kind)) return;
  const lib = LIBRARIES[kind];
  const id = String(form.get("id") ?? "");
  const values = valuesFrom(kind, form);
  if (!values[lib.fields[0].key]) return;
  // Tables share the library column shape; drizzle needs a loose cast for the dynamic table.
  const table = lib.table as any;
  if (id) {
    await ownerDb.update(table).set({ ...values, updatedAt: new Date(), updatedBy: session.userId }).where(eq(table.id, id));
  } else {
    await ownerDb.insert(table).values({ ...values, source: "admin", updatedBy: session.userId });
  }
  await audit({ actorUserId: session.userId, action: `library.${kind}.${id ? "update" : "create"}`, entity: kind, entityId: id || null, after: values });
  revalidatePath(`/admin/libraries/${kind}`);
}

export async function toggleLibraryItem(form: FormData) {
  const session = await requireAdmin();
  const kind = String(form.get("kind"));
  if (!isLibraryKind(kind)) return;
  const table = LIBRARIES[kind].table as any;
  const id = String(form.get("id"));
  await ownerDb.update(table).set({ isActive: sql`not is_active`, updatedAt: new Date(), updatedBy: session.userId }).where(eq(table.id, id));
  await audit({ actorUserId: session.userId, action: `library.${kind}.toggle`, entity: kind, entityId: id });
  revalidatePath(`/admin/libraries/${kind}`);
}
