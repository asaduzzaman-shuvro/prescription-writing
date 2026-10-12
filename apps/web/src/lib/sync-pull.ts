import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { withTenant } from "@rx/db";
import { appDb } from "./db";
import { shapeRow, type SyncRow } from "./sync-shape";
import { CATALOGUE_SYNC_TABLES, CLINIC_SYNC_TABLES } from "./sync-tables";

export interface SyncPull {
  clinic: Record<string, SyncRow[]>;
  catalogue: Record<string, SyncRow[]>;
}

function ts(column: string): string {
  if (!/^[a-z_]+$/.test(column)) throw new Error(`bad column ${column}`);
  return `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS ${column}`;
}

function rowsOf(result: unknown): Record<string, unknown>[] {
  if (!Array.isArray(result)) throw new Error("unexpected sync query result");
  return result as Record<string, unknown>[];
}

async function load(tx: { execute: (q: SQL) => Promise<unknown> }, table: string, query: SQL): Promise<SyncRow[]> {
  const out: SyncRow[] = [];
  for (const raw of rowsOf(await tx.execute(query))) {
    const row = shapeRow(table, raw);
    if (row) out.push(row);
  }
  return out;
}

/**
 * Snapshot the signed-in chamber plus the shared libraries and medicine catalogue.
 * Replaces the PowerSync download service on hosts that cannot run it.
 * Tenant filters are in the SQL itself: the cPanel role owns the tables and bypasses RLS.
 */
export async function pullSnapshot(tenantId: string, userId: string): Promise<SyncPull> {
  return withTenant(appDb, { tenantId, userId }, async (tx) => {
    const clinic: Record<string, SyncRow[]> = {};
    const catalogue: Record<string, SyncRow[]> = {};

    const put = async (bucket: Record<string, SyncRow[]>, table: string, query: SQL) => {
      bucket[table] = await load(tx, table, query);
    };

    await put(clinic, "specialty", sql`SELECT code AS id, name, name_bn FROM specialty`);
    await put(
      clinic,
      "complaint",
      sql`SELECT id::text AS id, specialty_code, sort_order, name, name_bn FROM complaint WHERE is_active`,
    );
    await put(
      clinic,
      "history_item",
      sql`SELECT id::text AS id, specialty_code, sort_order, name, category FROM history_item WHERE is_active`,
    );
    await put(
      clinic,
      "investigation",
      sql`SELECT id::text AS id, specialty_code, sort_order, name, category FROM investigation WHERE is_active`,
    );
    await put(
      clinic,
      "diagnosis",
      sql`SELECT id::text AS id, specialty_code, sort_order, name, icd10, icd11 FROM diagnosis WHERE is_active`,
    );
    await put(
      clinic,
      "advice_snippet",
      sql`SELECT id::text AS id, specialty_code, sort_order, text_bn, text_en, category FROM advice_snippet WHERE is_active`,
    );
    await put(
      clinic,
      "instruction_snippet",
      sql`SELECT id::text AS id, specialty_code, sort_order, text_bn, text_en FROM instruction_snippet WHERE is_active`,
    );
    await put(
      clinic,
      "specialty_template",
      sql`SELECT id::text AS id, specialty_code, name, version, schema FROM specialty_template WHERE is_active`,
    );
    await put(
      clinic,
      "lab_test",
      sql`SELECT id::text AS id, tenant_id::text AS tenant_id, code, name, short, unit, kind, department, sort_order,
            is_active::int AS is_active, spec::text AS spec, source, ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM lab_test
          WHERE (tenant_id IS NULL AND is_active) OR tenant_id = ${tenantId}::uuid`,
    );
    await put(
      clinic,
      "lab_panel",
      sql`SELECT id::text AS id, tenant_id::text AS tenant_id, key, name, department, sort_order,
            is_active::int AS is_active, spec::text AS spec, source, ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM lab_panel
          WHERE (tenant_id IS NULL AND is_active) OR tenant_id = ${tenantId}::uuid`,
    );
    await put(
      clinic,
      "lab_profile",
      sql`SELECT id::text AS id, tenant_id::text AS tenant_id, lab_name, address, phone, logo_data_url,
            signatories::text AS signatories, footer_text, print_settings::text AS print_settings,
            ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM lab_profile WHERE tenant_id = ${tenantId}::uuid`,
    );
    await put(
      clinic,
      "rx_template",
      sql`SELECT id::text AS id, tenant_id::text AS tenant_id, owner_user_id::text AS owner_user_id, specialty_code, name,
            payload::text AS payload, is_active::int AS is_active, ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM rx_template
          WHERE (tenant_id IS NULL AND is_active) OR tenant_id = ${tenantId}::uuid`,
    );
    await put(
      clinic,
      "patient",
      sql`SELECT id::text AS id, tenant_id::text AS tenant_id, code, name, dob::text AS dob, dob_estimated::int AS dob_estimated,
            sex::text AS sex, mobile, address, nid, brn, health_id, birth_weight_kg, gestational_age_weeks,
            to_json(allergies)::text AS allergies, pregnancy_status, notes, ${sql.raw(ts("consent_at"))},
            ${sql.raw(ts("report_files_consent_at"))}, guardian_name, created_by::text AS created_by,
            ${sql.raw(ts("deleted_at"))}, ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM patient WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL`,
    );
    await put(
      clinic,
      "encounter",
      sql`SELECT id::text AS id, tenant_id::text AS tenant_id, patient_id::text AS patient_id,
            doctor_user_id::text AS doctor_user_id, chamber_id::text AS chamber_id, visit_date::text AS visit_date,
            serial_no, status::text AS status, specialty_code, template_id::text AS template_id,
            vitals::text AS vitals, exam_findings::text AS exam_findings, fee, visit_type::text AS visit_type,
            created_by::text AS created_by, ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM encounter WHERE tenant_id = ${tenantId}::uuid`,
    );
    await put(
      clinic,
      "prescription",
      sql`SELECT id::text AS id, tenant_id::text AS tenant_id, encounter_id::text AS encounter_id,
            patient_id::text AS patient_id, doctor_user_id::text AS doctor_user_id, chamber_id::text AS chamber_id,
            version, supersedes_id::text AS supersedes_id, status::text AS status, doc::text AS doc,
            ${sql.raw(ts("finalized_at"))}, verify_token, ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM prescription WHERE tenant_id = ${tenantId}::uuid`,
    );
    await put(
      clinic,
      "lab_report",
      sql`SELECT id::text AS id, tenant_id::text AS tenant_id, patient_id::text AS patient_id,
            encounter_id::text AS encounter_id, report_date::text AS report_date, lab_name, panel, title,
            results::text AS results, conclusion, files::text AS files, source, request_id::text AS request_id, lab_no,
            department, specimen, ${sql.raw(ts("collected_at"))}, referred_by, prepared_by_name, verified_by_name,
            ${sql.raw(ts("verified_at"))}, comment, created_by::text AS created_by, ${sql.raw(ts("deleted_at"))},
            ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM lab_report WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL`,
    );
    await put(
      clinic,
      "chamber",
      sql`SELECT id::text AS id, tenant_id::text AS tenant_id, doctor_user_id::text AS doctor_user_id, name, address,
            phone, hours, schedule::text AS schedule, serial_phone, footer_text, logo_data_url, free_report_days,
            print_settings::text AS print_settings, is_active::int AS is_active,
            ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM chamber WHERE tenant_id = ${tenantId}::uuid`,
    );
    await put(
      clinic,
      "doctor_profile",
      sql`SELECT user_id::text AS id, tenant_id::text AS tenant_id, name_en, name_bn,
            to_json(degrees_en)::text AS degrees_en, to_json(degrees_bn)::text AS degrees_bn,
            designation, institution, specialty_code, specialty_label, bmdc_number, bmdc_expiry::text AS bmdc_expiry,
            ${sql.raw(ts("bmdc_verified_at"))}, signature_data_url
          FROM doctor_profile WHERE tenant_id = ${tenantId}::uuid`,
    );
    await put(
      clinic,
      "appointment",
      sql`SELECT id::text AS id, tenant_id::text AS tenant_id, chamber_id::text AS chamber_id,
            doctor_user_id::text AS doctor_user_id, patient_id::text AS patient_id, name, mobile,
            appt_date::text AS appt_date, serial_no, status::text AS status, encounter_id::text AS encounter_id,
            note, source, created_by::text AS created_by, ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM appointment WHERE tenant_id = ${tenantId}::uuid`,
    );
    await put(
      clinic,
      "doctor_favorite",
      sql`SELECT id::text AS id, tenant_id::text AS tenant_id, user_id::text AS user_id, product_id::text AS product_id,
            default_shortcut, use_count, ${sql.raw(ts("created_at"))}, ${sql.raw(ts("updated_at"))}
          FROM doctor_favorite WHERE tenant_id = ${tenantId}::uuid AND user_id = ${userId}::uuid`,
    );

    await put(
      catalogue,
      "dosage_form",
      sql`SELECT id::text AS id, name, short_label, default_route, default_unit FROM dosage_form`,
    );
    await put(catalogue, "company", sql`SELECT id::text AS id, name FROM company`);
    await put(
      catalogue,
      "generic",
      sql`SELECT id::text AS id, name, is_antibiotic::int AS is_antibiotic, aware_group::text AS aware_group,
            pregnancy_category, paed_max_mg_per_kg_day::text AS paed_max_mg_per_kg_day,
            adult_max_mg_per_day::text AS adult_max_mg_per_day
          FROM generic WHERE is_active`,
    );
    await put(
      catalogue,
      "brand_product",
      sql`SELECT id::text AS id, brand_name, form_id::text AS form_id, company_id::text AS company_id,
            strength_text, generic_text, medicine_system::text AS medicine_system
          FROM brand_product WHERE is_active`,
    );
    await put(
      catalogue,
      "product_ingredient",
      sql`SELECT product_id::text || ':' || position::text AS id, product_id::text AS product_id, position,
            generic_id::text AS generic_id, strength_value::text AS strength_value, strength_unit, basis
          FROM product_ingredient`,
    );
    await put(
      catalogue,
      "generic_interaction",
      sql`SELECT id::text AS id, generic_a::text AS generic_a, generic_b::text AS generic_b,
            severity::text AS severity, effect, management
          FROM generic_interaction WHERE is_active`,
    );

    for (const table of CLINIC_SYNC_TABLES) if (!clinic[table]) clinic[table] = [];
    for (const table of CATALOGUE_SYNC_TABLES) if (!catalogue[table]) catalogue[table] = [];
    return { clinic, catalogue };
  });
}
