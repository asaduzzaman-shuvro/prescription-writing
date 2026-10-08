/**
 * Client-side (browser SQLite) schema. Mirrors the columns selected in
 * infra/powersync/sync-config.yaml. Every table gets an implicit text `id`.
 * Types on the client are only text / integer / real: uuid, numeric, date, timestamptz, jsonb and
 * arrays arrive as text (jsonb/arrays as JSON strings), booleans as 0/1.
 */
import { column, Schema, Table } from "@powersync/web";

const brand_product = new Table(
  {
    brand_name: column.text,
    form_id: column.text,
    company_id: column.text,
    strength_text: column.text,
    generic_text: column.text,
    medicine_system: column.text,
  },
  { indexes: { brand: ["brand_name"], generic: ["generic_text"] } },
);
const dosage_form = new Table({ name: column.text, short_label: column.text, default_route: column.text, default_unit: column.text });
const company = new Table({ name: column.text });
const generic = new Table(
  {
    name: column.text,
    is_antibiotic: column.integer,
    aware_group: column.text,
    pregnancy_category: column.text,
    paed_max_mg_per_kg_day: column.text,
    adult_max_mg_per_day: column.text,
  },
  { indexes: { name: ["name"] } },
);
const product_ingredient = new Table(
  { product_id: column.text, position: column.integer, generic_id: column.text, strength_value: column.text, strength_unit: column.text, basis: column.text },
  { indexes: { product: ["product_id"], generic: ["generic_id"] } },
);
const generic_interaction = new Table(
  { generic_a: column.text, generic_b: column.text, severity: column.text, effect: column.text, management: column.text },
  { indexes: { a: ["generic_a"], b: ["generic_b"] } },
);

const specialty = new Table({ name: column.text, name_bn: column.text });
const lib = { specialty_code: column.text, sort_order: column.integer };
const complaint = new Table({ ...lib, name: column.text, name_bn: column.text });
const investigation = new Table({ ...lib, name: column.text, category: column.text });
const diagnosis = new Table({ ...lib, name: column.text, icd10: column.text, icd11: column.text });
const advice_snippet = new Table({ ...lib, text_bn: column.text, text_en: column.text, category: column.text });
const instruction_snippet = new Table({ ...lib, text_bn: column.text, text_en: column.text });
const specialty_template = new Table({ specialty_code: column.text, name: column.text, version: column.integer, schema: column.text });

const timestamps = { created_at: column.text, updated_at: column.text };

const patient = new Table(
  {
    tenant_id: column.text,
    code: column.text,
    name: column.text,
    dob: column.text,
    dob_estimated: column.integer,
    sex: column.text,
    mobile: column.text,
    address: column.text,
    nid: column.text,
    brn: column.text,
    health_id: column.text,
    birth_weight_kg: column.real,
    gestational_age_weeks: column.integer,
    allergies: column.text,
    notes: column.text,
    consent_at: column.text,
    guardian_name: column.text,
    created_by: column.text,
    deleted_at: column.text,
    ...timestamps,
  },
  { indexes: { mobile: ["mobile"], name: ["name"] } },
);

const encounter = new Table(
  {
    tenant_id: column.text,
    patient_id: column.text,
    doctor_user_id: column.text,
    chamber_id: column.text,
    visit_date: column.text,
    serial_no: column.integer,
    status: column.text,
    specialty_code: column.text,
    template_id: column.text,
    vitals: column.text,
    exam_findings: column.text,
    fee: column.integer,
    visit_type: column.text,
    created_by: column.text,
    ...timestamps,
  },
  { indexes: { date: ["visit_date"], patient: ["patient_id"] } },
);

const prescription = new Table(
  {
    tenant_id: column.text,
    encounter_id: column.text,
    patient_id: column.text,
    doctor_user_id: column.text,
    chamber_id: column.text,
    version: column.integer,
    supersedes_id: column.text,
    status: column.text,
    doc: column.text,
    finalized_at: column.text,
    verify_token: column.text,
    ...timestamps,
  },
  { indexes: { patient: ["patient_id"], encounter: ["encounter_id"] } },
);

/** Results are a JSON string of @rx/core LabResult[]. Soft-deleted rows drop out of the sync stream. */
const lab_report = new Table(
  {
    tenant_id: column.text,
    patient_id: column.text,
    encounter_id: column.text,
    report_date: column.text,
    lab_name: column.text,
    panel: column.text,
    title: column.text,
    results: column.text,
    conclusion: column.text,
    created_by: column.text,
    deleted_at: column.text,
    ...timestamps,
  },
  { indexes: { patient: ["patient_id", "report_date"], encounter: ["encounter_id"] } },
);

const chamber = new Table({
  tenant_id: column.text,
  doctor_user_id: column.text,
  name: column.text,
  address: column.text,
  phone: column.text,
  hours: column.text,
  schedule: column.text,
  serial_phone: column.text,
  footer_text: column.text,
  logo_data_url: column.text,
  free_report_days: column.integer,
  print_settings: column.text,
  is_active: column.integer,
  ...timestamps,
});

const doctor_profile = new Table({
  tenant_id: column.text,
  name_en: column.text,
  name_bn: column.text,
  degrees_en: column.text,
  degrees_bn: column.text,
  designation: column.text,
  institution: column.text,
  specialty_code: column.text,
  specialty_label: column.text,
  bmdc_number: column.text,
  bmdc_expiry: column.text,
  bmdc_verified_at: column.text,
  signature_data_url: column.text,
});

const rx_template = new Table({
  tenant_id: column.text,
  owner_user_id: column.text,
  specialty_code: column.text,
  name: column.text,
  payload: column.text,
  is_active: column.integer,
  ...timestamps,
});

const doctor_favorite = new Table(
  { tenant_id: column.text, user_id: column.text, product_id: column.text, default_shortcut: column.text, use_count: column.integer, ...timestamps },
  { indexes: { product: ["product_id"] } },
);

const appointment = new Table(
  {
    tenant_id: column.text,
    chamber_id: column.text,
    doctor_user_id: column.text,
    patient_id: column.text,
    name: column.text,
    mobile: column.text,
    appt_date: column.text,
    serial_no: column.integer,
    status: column.text,
    encounter_id: column.text,
    note: column.text,
    source: column.text,
    created_by: column.text,
    ...timestamps,
  },
  { indexes: { date: ["appt_date"] } },
);

export const AppSchema = new Schema({
  appointment,
  brand_product,
  dosage_form,
  company,
  generic,
  product_ingredient,
  generic_interaction,
  specialty,
  complaint,
  investigation,
  diagnosis,
  advice_snippet,
  instruction_snippet,
  specialty_template,
  patient,
  encounter,
  prescription,
  lab_report,
  chamber,
  doctor_profile,
  rx_template,
  doctor_favorite,
});

export type Database = (typeof AppSchema)["types"];
export type PatientRow = Database["patient"];
export type EncounterRow = Database["encounter"];
export type PrescriptionRow = Database["prescription"];
export type LabReportRow = Database["lab_report"];

/** Tables the client is allowed to write; everything else is read-only on the server side. */
export const WRITABLE_TABLES = ["appointment", "patient", "encounter", "prescription", "lab_report", "chamber", "rx_template", "doctor_favorite", "doctor_profile"] as const;
