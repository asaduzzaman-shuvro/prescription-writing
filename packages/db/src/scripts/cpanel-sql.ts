/**
 * SQL for shared cPanel PostgreSQL, which has no pg_trgm, unaccent, or pgcrypto,
 * and cannot create roles or a PowerSync publication.
 *
 *   pnpm --filter @rx/db exec tsx src/scripts/cpanel-sql.ts
 *   → dist/cpanel-schema.sql
 *
 * PostgreSQL 16 already provides gen_random_uuid(). Medicine search on this file's
 * database matches the start of the name.
 */
import { ENT_TEMPLATE, LAB_CURATED_PANELS, LAB_CURATED_TESTS, OPHTHALMOLOGY_TEMPLATE, VASCULAR_TEMPLATE, labPanelRow, labTestRow } from "@rx/core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ADVICE, COMPLAINTS, DIAGNOSES, HISTORIES, INSTRUCTIONS, INVESTIGATIONS, SPECIALTIES } from "../seed/libraries";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "../../migrations");
const outFile = join(here, "../../../../dist/cpanel-schema.sql");

const journal = JSON.parse(readFileSync(join(migrationsDir, "meta/_journal.json"), "utf8")) as {
  entries: { tag: string }[];
};

function skip(statement: string): boolean {
  return /create\s+extension/i.test(statement)
    || /gin_trgm_ops/i.test(statement)
    || /\brx_app\b/i.test(statement)
    || /powersync/i.test(statement);
}

const parts: string[] = [
  "-- Tables for shared cPanel. No pg_trgm indexes, no extra roles, no PowerSync.",
  "-- Run once: psql -h 127.0.0.1 -p 5432 -U sakuraph_SakuraPharma -d sakuraph_prescription -v ON_ERROR_STOP=1 -f cpanel-schema.sql",
  "BEGIN;",
];

for (const entry of journal.entries) {
  const file = readFileSync(join(migrationsDir, `${entry.tag}.sql`), "utf8");
  const statements = file.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  for (const statement of statements) {
    if (skip(statement)) continue;
    parts.push(statement.endsWith(";") ? statement : `${statement};`);
  }
}

const lit = (value: string | null | undefined) => (value == null ? "null" : `'${value.replace(/'/g, "''")}'`);

parts.push(`
insert into specialty (code, name, name_bn) values
${SPECIALTIES.map((s) => `  (${lit(s.code)}, ${lit(s.name)}, ${lit(s.nameBn)})`).join(",\n")}
on conflict (code) do nothing;
`);

function libraryInsert(table: string, columns: string[], rows: string[]) {
  parts.push(`
insert into ${table} (${columns.join(", ")})
select ${columns.join(", ")} from (values
${rows.join(",\n")}
) as v(${columns.join(", ")})
where not exists (select 1 from ${table});
`);
}

libraryInsert(
  "complaint",
  ["specialty_code", "sort_order", "source", "name", "name_bn"],
  COMPLAINTS.map((row, i) => `  (${lit(row.specialtyCode ?? null)}, ${i}, 'rx-curated', ${lit(row.name)}, ${lit(row.nameBn ?? null)})`),
);
libraryInsert(
  "history_item",
  ["specialty_code", "sort_order", "source", "name", "category"],
  HISTORIES.map((row, i) => `  (${lit(row.specialtyCode ?? null)}, ${i}, 'rx-curated', ${lit(row.name)}, ${lit(row.category)})`),
);
libraryInsert(
  "investigation",
  ["specialty_code", "sort_order", "source", "name", "category"],
  INVESTIGATIONS.map((row, i) => `  (${lit(row.specialtyCode ?? null)}, ${i}, 'rx-curated', ${lit(row.name)}, ${lit(row.category)})`),
);
libraryInsert(
  "diagnosis",
  ["specialty_code", "sort_order", "source", "name", "icd10"],
  DIAGNOSES.map((row, i) => `  (${lit(row.specialtyCode ?? null)}, ${i}, 'rx-curated', ${lit(row.name)}, ${lit(row.icd10 ?? null)})`),
);
libraryInsert(
  "advice_snippet",
  ["specialty_code", "sort_order", "source", "text_bn", "text_en", "category"],
  ADVICE.map((row, i) => `  (${lit(row.specialtyCode ?? null)}, ${i}, 'rx-curated', ${lit(row.textBn)}, ${lit(row.textEn ?? null)}, ${lit(row.category ?? null)})`),
);
libraryInsert(
  "instruction_snippet",
  ["specialty_code", "sort_order", "source", "text_bn", "text_en"],
  INSTRUCTIONS.map((row, i) => `  (${lit(row.specialtyCode ?? null)}, ${i}, 'rx-curated', ${lit(row.textBn)}, ${lit(row.textEn ?? null)})`),
);

const templates: [string, string, unknown][] = [
  ["ent", "ENT examination", ENT_TEMPLATE],
  ["ophthalmology", "Eye examination", OPHTHALMOLOGY_TEMPLATE],
  ["vascular", "Vascular examination", VASCULAR_TEMPLATE],
];
for (const [code, name, schema] of templates) {
  parts.push(`
insert into specialty_template (specialty_code, name, version, schema, source)
select ${lit(code)}, ${lit(name)}, 1, ${lit(JSON.stringify(schema))}, 'rx-curated'
where not exists (
  select 1 from specialty_template where specialty_code = ${lit(code)} and name = ${lit(name)}
);
`);
}

const tests = LAB_CURATED_TESTS.map((test, i) => {
  const row = labTestRow(test, i);
  return `  (${lit(row.code)}, ${lit(row.name)}, ${lit(row.short)}, ${lit(row.unit ?? null)}, ${lit(row.kind)}, ${lit(row.department ?? null)}, ${row.sortOrder}, ${lit(JSON.stringify(row.spec))}::jsonb, 'rx-curated')`;
});
libraryInsert(
  "lab_test",
  ["code", "name", "short", "unit", "kind", "department", "sort_order", "spec", "source"],
  tests,
);

const panels = LAB_CURATED_PANELS.map((panel, i) => {
  const row = labPanelRow(panel, i);
  return `  (${lit(row.key)}, ${lit(row.name)}, ${lit(row.department ?? null)}, ${row.sortOrder}, ${lit(JSON.stringify(row.spec))}::jsonb, 'rx-curated')`;
});
libraryInsert(
  "lab_panel",
  ["key", "name", "department", "sort_order", "spec", "source"],
  panels,
);

parts.push("COMMIT;");

mkdirSync(dirname(outFile), { recursive: true });
const sqlText = parts.join("\n\n");
writeFileSync(outFile, sqlText);
const forbidden = ["gin_trgm_ops", "rx_app", "powersync", "CREATE EXTENSION"];
for (const word of forbidden) {
  if (sqlText.includes(word)) {
    console.error(`refusing to write SQL that still contains ${word}`);
    process.exit(1);
  }
}
console.log(`${outFile} (${Math.round(sqlText.length / 1024)} KB)`);
