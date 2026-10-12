import { ENT_TEMPLATE, OPHTHALMOLOGY_TEMPLATE, VASCULAR_TEMPLATE, type SpecialtyTemplateSchema } from "@rx/core";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import * as s from "../schema";
import { ADVICE, COMPLAINTS, DIAGNOSES, HISTORIES, INSTRUCTIONS, INVESTIGATIONS, SPECIALTIES } from "./libraries";
import { seedLabCatalogue } from "./lab-catalogue";

/** Complaints, diagnoses, advice, and the other pick-lists. Curated in this repo; safe for production. */
export async function seedLibraries(db: Db) {
  await db.insert(s.specialty).values(SPECIALTIES).onConflictDoNothing();
  const src = { source: "rx-curated" };
  const withOrder = <T extends object>(rows: T[]) => rows.map((r, i) => ({ ...r, sortOrder: i, ...src }));
  const histories = await db.select({ n: sql<number>`count(*)::int` }).from(s.historyItem);
  if (histories[0]!.n === 0) {
    await db.insert(s.historyItem).values(withOrder(HISTORIES));
    console.log("libraries: seeded history");
  }
  const existing = await db.select({ n: sql<number>`count(*)::int` }).from(s.complaint);
  if (existing[0]!.n > 0) {
    for (const { code } of SPECIALTIES) {
      if (code === "general") continue;
      const have = await db.select({ n: sql<number>`count(*)::int` }).from(s.complaint).where(eq(s.complaint.specialtyCode, code));
      if (have[0]!.n > 0) continue;
      const only = <T extends { specialtyCode?: string | null }>(rows: T[]) => withOrder(rows).filter((r) => r.specialtyCode === code);
      for (const [table, rows] of [[s.complaint, only(COMPLAINTS)], [s.investigation, only(INVESTIGATIONS)], [s.diagnosis, only(DIAGNOSES)], [s.adviceSnippet, only(ADVICE)], [s.instructionSnippet, only(INSTRUCTIONS)]] as const) {
        if (rows.length) await db.insert(table as typeof s.complaint).values(rows as never);
      }
      console.log(`libraries: added ${code}`);
    }
    return console.log("libraries: already seeded");
  }
  await db.insert(s.complaint).values(withOrder(COMPLAINTS));
  await db.insert(s.investigation).values(withOrder(INVESTIGATIONS));
  await db.insert(s.diagnosis).values(withOrder(DIAGNOSES));
  await db.insert(s.adviceSnippet).values(withOrder(ADVICE));
  await db.insert(s.instructionSnippet).values(withOrder(INSTRUCTIONS));
  console.log("libraries: seeded");
}

/** ENT, eye, and vascular exam templates. Does not copy medicine products or demo logins. */
export async function seedExamTemplates(db: Db) {
  const name = "ENT examination";
  const [latest] = await db
    .select({ version: s.specialtyTemplate.version, schema: s.specialtyTemplate.schema, source: s.specialtyTemplate.source })
    .from(s.specialtyTemplate)
    .where(and(eq(s.specialtyTemplate.specialtyCode, "ent"), eq(s.specialtyTemplate.name, name)))
    .orderBy(desc(s.specialtyTemplate.version))
    .limit(1);
  if (!latest) {
    await db.insert(s.specialtyTemplate).values({ specialtyCode: "ent", name, version: 1, schema: JSON.stringify(ENT_TEMPLATE), source: "rx-curated" });
    console.log("ENT exam template: seeded");
  } else if (latest.source === "rx-curated" && latest.schema !== JSON.stringify(ENT_TEMPLATE)) {
    await db.transaction(async (tx) => {
      await tx.update(s.specialtyTemplate).set({ isActive: false, updatedAt: new Date() }).where(and(eq(s.specialtyTemplate.specialtyCode, "ent"), eq(s.specialtyTemplate.name, name)));
      await tx.insert(s.specialtyTemplate).values({ specialtyCode: "ent", name, version: latest.version + 1, schema: JSON.stringify(ENT_TEMPLATE), source: "rx-curated" });
    });
    console.log(`ENT exam template: published v${latest.version + 1}`);
  } else if (latest.source !== "rx-curated" && !latest.schema.includes('"sketch"')) {
    console.log("ENT exam template was edited by an admin: add the oropharynx/larynx/neck picture fields in Admin → Specialty templates.");
  }

  const templates: [string, string, SpecialtyTemplateSchema][] = [
    ["ophthalmology", "Eye examination", OPHTHALMOLOGY_TEMPLATE],
    ["vascular", "Vascular examination", VASCULAR_TEMPLATE],
  ];
  for (const [code, label, schema] of templates) {
    const exists = await db.select({ id: s.specialtyTemplate.id }).from(s.specialtyTemplate).where(eq(s.specialtyTemplate.specialtyCode, code));
    if (exists[0]) continue;
    await db.insert(s.specialtyTemplate).values({ specialtyCode: code, name: label, version: 1, schema: JSON.stringify(schema), source: "rx-curated" });
    console.log(`${label} template: seeded`);
  }
}

/** Tables' curated rows: pick-lists, lab catalogue, exam templates. */
export async function seedCurated(db: Db) {
  await seedLibraries(db);
  console.log("lab catalogue:", await seedLabCatalogue(db));
  await seedExamTemplates(db);
}
