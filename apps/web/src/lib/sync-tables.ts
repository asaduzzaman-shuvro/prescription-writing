/**
 * Columns the browser SQLite schema keeps for each synced table.
 * The pull API and the custom sync client both use this list.
 * `id` is the PowerSync primary key (specialty uses its code, doctor_profile uses user_id).
 */

export const CLINIC_SYNC_TABLES = [
  "specialty",
  "complaint",
  "history_item",
  "investigation",
  "diagnosis",
  "advice_snippet",
  "instruction_snippet",
  "specialty_template",
  "lab_test",
  "lab_panel",
  "lab_profile",
  "rx_template",
  "patient",
  "encounter",
  "prescription",
  "lab_report",
  "chamber",
  "doctor_profile",
  "appointment",
  "doctor_favorite",
] as const;

export const CATALOGUE_SYNC_TABLES = [
  "dosage_form",
  "company",
  "generic",
  "brand_product",
  "product_ingredient",
  "generic_interaction",
] as const;

export const SYNC_COLUMNS: Record<string, readonly string[]> = {
  specialty: ["id", "name", "name_bn"],
  complaint: ["id", "specialty_code", "sort_order", "name", "name_bn"],
  history_item: ["id", "specialty_code", "sort_order", "name", "category"],
  investigation: ["id", "specialty_code", "sort_order", "name", "category"],
  diagnosis: ["id", "specialty_code", "sort_order", "name", "icd10", "icd11"],
  advice_snippet: ["id", "specialty_code", "sort_order", "text_bn", "text_en", "category"],
  instruction_snippet: ["id", "specialty_code", "sort_order", "text_bn", "text_en"],
  specialty_template: ["id", "specialty_code", "name", "version", "schema"],
  lab_test: ["id", "tenant_id", "code", "name", "short", "unit", "kind", "department", "sort_order", "is_active", "spec", "source", "created_at", "updated_at"],
  lab_panel: ["id", "tenant_id", "key", "name", "department", "sort_order", "is_active", "spec", "source", "created_at", "updated_at"],
  lab_profile: ["id", "tenant_id", "lab_name", "address", "phone", "logo_data_url", "signatories", "footer_text", "print_settings", "created_at", "updated_at"],
  rx_template: ["id", "tenant_id", "owner_user_id", "specialty_code", "name", "payload", "is_active", "created_at", "updated_at"],
  patient: [
    "id", "tenant_id", "code", "name", "dob", "dob_estimated", "sex", "mobile", "address", "nid", "brn", "health_id",
    "birth_weight_kg", "gestational_age_weeks", "allergies", "pregnancy_status", "notes", "consent_at",
    "report_files_consent_at", "guardian_name", "created_by", "deleted_at", "created_at", "updated_at",
  ],
  encounter: [
    "id", "tenant_id", "patient_id", "doctor_user_id", "chamber_id", "visit_date", "serial_no", "status",
    "specialty_code", "template_id", "vitals", "exam_findings", "fee", "visit_type", "created_by", "created_at", "updated_at",
  ],
  prescription: [
    "id", "tenant_id", "encounter_id", "patient_id", "doctor_user_id", "chamber_id", "version", "supersedes_id",
    "status", "doc", "finalized_at", "verify_token", "created_at", "updated_at",
  ],
  lab_report: [
    "id", "tenant_id", "patient_id", "encounter_id", "report_date", "lab_name", "panel", "title", "results",
    "conclusion", "files", "source", "request_id", "lab_no", "department", "specimen", "collected_at", "referred_by",
    "prepared_by_name", "verified_by_name", "verified_at", "comment", "created_by", "deleted_at", "created_at", "updated_at",
  ],
  chamber: [
    "id", "tenant_id", "doctor_user_id", "name", "address", "room", "phone", "hours", "schedule", "serial_phone",
    "footer_text", "logo_data_url", "free_report_days", "report_fee", "print_settings", "is_active", "created_at", "updated_at",
  ],
  doctor_profile: [
    "id", "tenant_id", "name_en", "name_bn", "degrees_en", "degrees_bn", "designation", "institution",
    "specialty_code", "specialty_label", "bmdc_number", "bmdc_expiry", "bmdc_verified_at", "signature_data_url",
  ],
  appointment: [
    "id", "tenant_id", "chamber_id", "doctor_user_id", "patient_id", "name", "mobile", "appt_date", "serial_no",
    "status", "encounter_id", "note", "source", "created_by", "created_at", "updated_at",
  ],
  doctor_favorite: ["id", "tenant_id", "user_id", "product_id", "default_shortcut", "use_count", "created_at", "updated_at"],
  dosage_form: ["id", "name", "short_label", "default_route", "default_unit"],
  company: ["id", "name"],
  generic: ["id", "name", "is_antibiotic", "aware_group", "pregnancy_category", "paed_max_mg_per_kg_day", "adult_max_mg_per_day"],
  brand_product: ["id", "brand_name", "form_id", "company_id", "strength_text", "generic_text", "medicine_system"],
  product_ingredient: ["id", "product_id", "position", "generic_id", "strength_value", "strength_unit", "basis"],
  generic_interaction: ["id", "generic_a", "generic_b", "severity", "effect", "management"],
};

export const INT_COLUMNS = new Set([
  "sort_order", "is_antibiotic", "position", "version", "is_active", "dob_estimated", "gestational_age_weeks",
  "serial_no", "fee", "free_report_days", "report_fee", "use_count",
]);
