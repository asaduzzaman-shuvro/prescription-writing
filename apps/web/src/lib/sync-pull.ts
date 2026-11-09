import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { withTenant } from "@rx/db";
import { appDb } from "./db";
import { normalizeEtag, rowsFromBundle, type SyncRow } from "./sync-shape";
import { CATALOGUE_SYNC_TABLES, CLINIC_SYNC_TABLES } from "./sync-tables";

export interface SyncPull {
  clinic: Record<string, SyncRow[]>;
  catalogue: Record<string, SyncRow[]>;
}

export type SyncPart = "clinic" | "catalogue";

export interface PartSnapshot {
  etag: string;
  unchanged: boolean;
  rows?: Record<string, SyncRow[]>;
}

interface Part {
  table: string;
  query: SQL;
  rev: SQL;
}

type Executor = { execute: (q: SQL) => Promise<unknown> };

/** How long a shared catalogue snapshot is reused across doctors. Imports show up on the next refresh after this. */
const CATALOGUE_FRESH_MS = 60_000;

function ts(column: string): string {
  if (!/^[a-z_]+$/.test(column)) throw new Error(`bad column ${column}`);
  return `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS ${column}`;
}

function one(result: unknown): Record<string, unknown> {
  if (!Array.isArray(result) || !result[0] || typeof result[0] !== "object") return {};
  return result[0] as Record<string, unknown>;
}

/** count + max(updated_at) for the same rows the download selects. A write that bumps updated_at changes the etag. */
function revUpdated(table: string, where: SQL = sql`true`): SQL {
  if (!/^[a-z_]+$/.test(table)) throw new Error(`bad table ${table}`);
  return sql`(SELECT count(*)::text || ':' || coalesce(max(updated_at)::text, '') FROM ${sql.raw(table)} WHERE ${where})`;
}

function clinicParts(tenantId: string, userId: string): Part[] {
  const tenant = sql`${tenantId}::uuid`;
  const user = sql`${userId}::uuid`;
  const active = sql`is_active`;
  return [
    {
      table: "specialty",
      query: sql`SELECT code AS id, name, name_bn FROM specialty`,
      rev: sql`(SELECT count(*)::text || ':' || coalesce(md5(string_agg(code || name || coalesce(name_bn, ''), '|' ORDER BY code)), '') FROM specialty)`,
    },
    {
      table: "complaint",
      query: sql`SELECT id::text AS id, specialty_code, sort_order, name, name_bn FROM complaint WHERE is_active`,
      rev: revUpdated("complaint", active),
    },
    {
      table: "history_item",
      query: sql`SELECT id::text AS id, specialty_code, sort_order, name, category FROM history_item WHERE is_active`,
      rev: revUpdated("history_item", active),
    },
    {
      table: "investigation",
      query: sql`SELECT id::text AS id, specialty_code, sort_order, name, category FROM investigation WHERE is_active`,
      rev: revUpdated("investigation", active),
    },
    {
      table: "diagnosis",
      query: sql`SELECT id::text AS id, specialty_code, sort_order, name, icd10, icd11 FROM diagnosis WHERE is_active`,
      rev: revUpdated("diagnosis", active),
    },
    {
      table: "advice_snippet",
      query: sql`SELECT id::text AS id, specialty_code, sort_order, text_bn, text_en, category FROM advice_snippet WHERE is_active`,
      rev: revUpdated("advice_snippet", active),
    },
    {
      table: "instruction_snippet",
      query: sql`SELECT id::text AS id, specialty_code, sort_order, text_bn, text_en FROM instruction_snippet WHERE is_active`,
      rev: revUpdated("instruction_snippet", active),
    },
    {
      table: "specialty_template",
      query: sql`SELECT id::text AS id, specialty_code, name, version, schema FROM specialty_template WHERE is_active`,
      rev: revUpdated("specialty_template", active),
    },
    {
      table: "lab_test",
      query: sql`SELECT id::text AS id, tenant_id::text AS tenant_id, code, name, short, unit, kind, department, sort_order,
            is_active::int AS is_active, spec::text AS spec, source, ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM lab_test
          WHERE (tenant_id IS NULL AND is_active) OR tenant_id = ${tenant}`,
      rev: revUpdated("lab_test", sql`(tenant_id IS NULL AND is_active) OR tenant_id = ${tenant}`),
    },
    {
      table: "lab_panel",
      query: sql`SELECT id::text AS id, tenant_id::text AS tenant_id, key, name, department, sort_order,
            is_active::int AS is_active, spec::text AS spec, source, ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM lab_panel
          WHERE (tenant_id IS NULL AND is_active) OR tenant_id = ${tenant}`,
      rev: revUpdated("lab_panel", sql`(tenant_id IS NULL AND is_active) OR tenant_id = ${tenant}`),
    },
    {
      table: "lab_profile",
      query: sql`SELECT id::text AS id, tenant_id::text AS tenant_id, lab_name, address, phone, logo_data_url,
            signatories::text AS signatories, footer_text, print_settings::text AS print_settings,
            ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM lab_profile WHERE tenant_id = ${tenant}`,
      rev: revUpdated("lab_profile", sql`tenant_id = ${tenant}`),
    },
    {
      table: "rx_template",
      query: sql`SELECT id::text AS id, tenant_id::text AS tenant_id, owner_user_id::text AS owner_user_id, specialty_code, name,
            payload::text AS payload, is_active::int AS is_active, ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM rx_template
          WHERE (tenant_id IS NULL AND is_active) OR tenant_id = ${tenant}`,
      rev: revUpdated("rx_template", sql`(tenant_id IS NULL AND is_active) OR tenant_id = ${tenant}`),
    },
    {
      table: "patient",
      query: sql`SELECT id::text AS id, tenant_id::text AS tenant_id, code, name, dob::text AS dob, dob_estimated::int AS dob_estimated,
            sex::text AS sex, mobile, address, nid, brn, health_id, birth_weight_kg, gestational_age_weeks,
            to_json(allergies)::text AS allergies, pregnancy_status, notes, ${sql.raw(ts("consent_at"))},
            ${sql.raw(ts("report_files_consent_at"))}, guardian_name, referred_by, created_by::text AS created_by,
            ${sql.raw(ts("deleted_at"))}, ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM patient WHERE tenant_id = ${tenant} AND deleted_at IS NULL`,
      rev: revUpdated("patient", sql`tenant_id = ${tenant} AND deleted_at IS NULL`),
    },
    {
      table: "encounter",
      query: sql`SELECT id::text AS id, tenant_id::text AS tenant_id, patient_id::text AS patient_id,
            doctor_user_id::text AS doctor_user_id, chamber_id::text AS chamber_id, visit_date::text AS visit_date,
            serial_no, status::text AS status, specialty_code, template_id::text AS template_id,
            vitals::text AS vitals, exam_findings::text AS exam_findings, fee, visit_type::text AS visit_type,
            created_by::text AS created_by, ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM encounter WHERE tenant_id = ${tenant}`,
      rev: revUpdated("encounter", sql`tenant_id = ${tenant}`),
    },
    {
      table: "prescription",
      query: sql`SELECT id::text AS id, tenant_id::text AS tenant_id, encounter_id::text AS encounter_id,
            patient_id::text AS patient_id, doctor_user_id::text AS doctor_user_id, chamber_id::text AS chamber_id,
            version, supersedes_id::text AS supersedes_id, status::text AS status, doc::text AS doc,
            ${sql.raw(ts("finalized_at"))}, verify_token, ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM prescription WHERE tenant_id = ${tenant}`,
      rev: revUpdated("prescription", sql`tenant_id = ${tenant}`),
    },
    {
      table: "lab_report",
      query: sql`SELECT id::text AS id, tenant_id::text AS tenant_id, patient_id::text AS patient_id,
            encounter_id::text AS encounter_id, report_date::text AS report_date, lab_name, panel, title,
            results::text AS results, conclusion, files::text AS files, source, request_id::text AS request_id, lab_no,
            department, specimen, ${sql.raw(ts("collected_at"))}, referred_by, prepared_by_name, verified_by_name,
            ${sql.raw(ts("verified_at"))}, comment, created_by::text AS created_by, ${sql.raw(ts("deleted_at"))},
            ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM lab_report WHERE tenant_id = ${tenant} AND deleted_at IS NULL`,
      rev: revUpdated("lab_report", sql`tenant_id = ${tenant} AND deleted_at IS NULL`),
    },
    {
      table: "chamber",
      query: sql`SELECT id::text AS id, tenant_id::text AS tenant_id, doctor_user_id::text AS doctor_user_id, name, address,
            room, phone, hours, schedule::text AS schedule, serial_phone, footer_text, logo_data_url, free_report_days,
            report_fee, print_settings::text AS print_settings, is_active::int AS is_active,
            ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM chamber WHERE tenant_id = ${tenant}`,
      rev: sql`(SELECT count(*)::text || ':' || coalesce(max(updated_at)::text, '') || ':' || coalesce(sum(report_fee)::text, '') FROM chamber WHERE tenant_id = ${tenant})`,
    },
    {
      table: "doctor_profile",
      query: sql`SELECT user_id::text AS id, tenant_id::text AS tenant_id, name_en, name_bn,
            to_json(degrees_en)::text AS degrees_en, to_json(degrees_bn)::text AS degrees_bn,
            designation, institution, specialty_code, specialty_label, bmdc_number, bmdc_expiry::text AS bmdc_expiry,
            ${sql.raw(ts("bmdc_verified_at"))}, signature_data_url
          FROM doctor_profile WHERE tenant_id = ${tenant}`,
      rev: revUpdated("doctor_profile", sql`tenant_id = ${tenant}`),
    },
    {
      table: "appointment",
      query: sql`SELECT id::text AS id, tenant_id::text AS tenant_id, chamber_id::text AS chamber_id,
            doctor_user_id::text AS doctor_user_id, patient_id::text AS patient_id, name, mobile,
            appt_date::text AS appt_date, serial_no, status::text AS status, encounter_id::text AS encounter_id,
            note, source, created_by::text AS created_by, ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM appointment WHERE tenant_id = ${tenant}`,
      rev: revUpdated("appointment", sql`tenant_id = ${tenant}`),
    },
    {
      table: "doctor_favorite",
      query: sql`SELECT id::text AS id, tenant_id::text AS tenant_id, user_id::text AS user_id, product_id::text AS product_id,
            default_shortcut, use_count, ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM doctor_favorite WHERE tenant_id = ${tenant} AND user_id = ${user}`,
      rev: revUpdated("doctor_favorite", sql`tenant_id = ${tenant} AND user_id = ${user}`),
    },
    {
      // Only the doctor who added a medicine sees it here; once approved it also arrives as a catalogue product.
      table: "custom_medicine",
      query: sql`SELECT id::text AS id, tenant_id::text AS tenant_id, owner_user_id::text AS owner_user_id, brand_name,
            form_id::text AS form_id, strength_text, generic_text, to_json(generic_ids)::text AS generic_ids,
            company_id::text AS company_id, company_name, status::text AS status, review_note,
            approved_product_id::text AS approved_product_id, ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM custom_medicine WHERE tenant_id = ${tenant} AND owner_user_id = ${user}`,
      rev: revUpdated("custom_medicine", sql`tenant_id = ${tenant} AND owner_user_id = ${user}`),
    },
    {
      // A doctor's own C/C lines: only the doctor who added or edited one sees it. Shared ones arrive as `complaint`.
      table: "doctor_complaint",
      query: sql`SELECT id::text AS id, tenant_id::text AS tenant_id, owner_user_id::text AS owner_user_id, name, name_bn,
            replaces_complaint_id::text AS replaces_complaint_id, is_active::int AS is_active, status::text AS status, review_note,
            approved_complaint_id::text AS approved_complaint_id, ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM doctor_complaint WHERE tenant_id = ${tenant} AND owner_user_id = ${user}`,
      rev: revUpdated("doctor_complaint", sql`tenant_id = ${tenant} AND owner_user_id = ${user}`),
    },
  ];
}

function catalogueParts(): Part[] {
  const active = sql`is_active`;
  return [
    {
      table: "dosage_form",
      query: sql`SELECT id::text AS id, name, short_label, default_route, default_unit FROM dosage_form`,
      rev: revUpdated("dosage_form"),
    },
    {
      table: "company",
      query: sql`SELECT id::text AS id, name FROM company`,
      rev: revUpdated("company"),
    },
    {
      table: "generic",
      query: sql`SELECT id::text AS id, name, is_antibiotic::int AS is_antibiotic, aware_group::text AS aware_group,
            pregnancy_category, paed_max_mg_per_kg_day::text AS paed_max_mg_per_kg_day,
            adult_max_mg_per_day::text AS adult_max_mg_per_day
          FROM generic WHERE is_active`,
      rev: revUpdated("generic", active),
    },
    {
      table: "brand_product",
      query: sql`SELECT id::text AS id, brand_name, form_id::text AS form_id, company_id::text AS company_id,
            strength_text, generic_text, medicine_system::text AS medicine_system
          FROM brand_product WHERE is_active`,
      rev: revUpdated("brand_product", active),
    },
    {
      table: "product_ingredient",
      query: sql`SELECT product_id::text || ':' || position::text AS id, product_id::text AS product_id, position,
            generic_id::text AS generic_id, strength_value::text AS strength_value, strength_unit, basis
          FROM product_ingredient`,
      // No updated_at on this table. Hash the synced columns so a strength edit still changes the etag.
      rev: sql`(SELECT count(*)::text || ':' || coalesce(sum(hashtextextended(
            product_id::text || ':' || position::text || ':' || coalesce(generic_id::text, '') || ':' ||
            coalesce(strength_value::text, '') || ':' || coalesce(strength_unit, '') || ':' || coalesce(basis, ''),
            0))::text, '0') FROM product_ingredient)`,
    },
    {
      table: "generic_interaction",
      query: sql`SELECT id::text AS id, generic_a::text AS generic_a, generic_b::text AS generic_b,
            severity::text AS severity, effect, management
          FROM generic_interaction WHERE is_active`,
      rev: revUpdated("generic_interaction", active),
    },
  ];
}

function etagQuery(parts: Part[]): SQL {
  return sql`SELECT md5(concat_ws('|', ${sql.join(
    parts.map((p) => p.rev),
    sql`, `,
  )})) AS etag`;
}

function bundleQuery(parts: Part[]): SQL {
  const cols = parts.map((p) => {
    if (!/^[a-z_]+$/.test(p.table)) throw new Error(`bad table ${p.table}`);
    return sql`COALESCE((SELECT json_agg(row_to_json(x)) FROM (${p.query}) x), '[]'::json) AS ${sql.raw(`"${p.table}"`)}`;
  });
  return sql`SELECT ${sql.join(cols, sql`, `)}`;
}

async function readEtag(tx: Executor, parts: Part[]): Promise<string> {
  const etag = one(await tx.execute(etagQuery(parts))).etag;
  if (typeof etag !== "string" || !etag) throw new Error("sync etag missing");
  return etag;
}

async function readBundle(tx: Executor, parts: Part[]): Promise<Record<string, SyncRow[]>> {
  const row = one(await tx.execute(bundleQuery(parts)));
  const out: Record<string, SyncRow[]> = {};
  for (const p of parts) out[p.table] = rowsFromBundle(p.table, row[p.table]);
  return out;
}

function fill(tables: readonly string[], rows: Record<string, SyncRow[]>): Record<string, SyncRow[]> {
  const out = { ...rows };
  for (const table of tables) if (!out[table]) out[table] = [];
  return out;
}

interface CachedCatalogue {
  etag: string;
  rows: Record<string, SyncRow[]>;
  freshUntil: number;
}

let catalogueCache: CachedCatalogue | null = null;
let catalogueFlight: Promise<CachedCatalogue> | null = null;

async function loadCatalogue(tenantId: string, userId: string): Promise<CachedCatalogue> {
  const parts = catalogueParts();
  return withTenant(appDb, { tenantId, userId }, async (tx) => {
    const etag = await readEtag(tx, parts);
    if (catalogueCache?.etag === etag) {
      return { etag, rows: catalogueCache.rows, freshUntil: Date.now() + CATALOGUE_FRESH_MS };
    }
    const rows = fill(CATALOGUE_SYNC_TABLES, await readBundle(tx, parts));
    return { etag, rows, freshUntil: Date.now() + CATALOGUE_FRESH_MS };
  });
}

/** One in-flight catalogue read, then a minute of reuse. The medicine list is the same for every chamber. */
function catalogueSnapshot(tenantId: string, userId: string): Promise<CachedCatalogue> {
  if (catalogueCache && Date.now() < catalogueCache.freshUntil) return Promise.resolve(catalogueCache);
  if (!catalogueFlight) {
    catalogueFlight = loadCatalogue(tenantId, userId)
      .then((snap) => {
        catalogueCache = snap;
        return snap;
      })
      .finally(() => {
        catalogueFlight = null;
      });
  }
  return catalogueFlight;
}

/**
 * Download one half of the chamber snapshot.
 * `ifNoneMatch` is the etag the browser already applied. When it still matches, the rows are not read or sent.
 * Clinic data is one round trip (etag, then the rows only if it changed). The catalogue is shared and cached.
 */
export async function pullPart(tenantId: string, userId: string, part: SyncPart, ifNoneMatch: string | null): Promise<PartSnapshot> {
  const clientEtag = normalizeEtag(ifNoneMatch);
  if (part === "catalogue") {
    const snap = await catalogueSnapshot(tenantId, userId);
    if (clientEtag && clientEtag === snap.etag) return { etag: snap.etag, unchanged: true };
    return { etag: snap.etag, unchanged: false, rows: snap.rows };
  }
  const parts = clinicParts(tenantId, userId);
  return withTenant(appDb, { tenantId, userId }, async (tx) => {
    const etag = await readEtag(tx, parts);
    if (clientEtag && clientEtag === etag) return { etag, unchanged: true };
    return { etag, unchanged: false, rows: fill(CLINIC_SYNC_TABLES, await readBundle(tx, parts)) };
  });
}

/**
 * Full snapshot for clients that still call /api/sync/pull without ?part=.
 * Clinic and catalogue run together, each as a single query instead of one round trip per table.
 */
export async function pullSnapshot(tenantId: string, userId: string): Promise<SyncPull> {
  const [clinic, catalogue] = await Promise.all([
    pullPart(tenantId, userId, "clinic", null),
    pullPart(tenantId, userId, "catalogue", null),
  ]);
  return { clinic: clinic.rows ?? {}, catalogue: catalogue.rows ?? {} };
}
