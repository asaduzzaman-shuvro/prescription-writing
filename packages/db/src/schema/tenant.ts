/**
 * Tenant-scoped data (clinics / solo doctors). Every table here has `tenant_id` and is protected by
 * Postgres row-level security (see migrations/*_rls.sql). Rows synced to clients use UUID ids that
 * can be generated offline.
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { brandProduct, company, dosageForm, specialty, specialtyTemplate } from "./catalogue";

export const platformRole = pgEnum("platform_role", ["super_admin", "data_editor"]);
export const tenantRole = pgEnum("tenant_role", ["clinic_admin", "doctor", "assistant"]);
export const tenantKind = pgEnum("tenant_kind", ["solo", "clinic"]);
export const tenantStatus = pgEnum("tenant_status", ["pending", "active", "suspended"]);
export const sexEnum = pgEnum("sex", ["male", "female", "other"]);
export const prescriptionStatus = pgEnum("prescription_status", ["draft", "final"]);
/** new = first consultation, followup = paid revisit, report = showing test reports (often free). */
export const visitType = pgEnum("visit_type", ["new", "followup", "report"]);
export const encounterStatus = pgEnum("encounter_status", ["waiting", "in_progress", "done", "cancelled"]);
export const customMedicineStatus = pgEnum("custom_medicine_status", ["pending", "approved", "rejected"]);

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
};

export const tenant = pgTable("tenant", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  kind: tenantKind().notNull().default("solo"),
  status: tenantStatus().notNull().default("pending"),
  plan: text().notNull().default("trial"),
  /** Paid-until date; null = no expiry (trial handled by plan). */
  planExpiresAt: date(),
  /** SMS credits remaining (prepaid, bought from the platform). */
  smsCredits: integer().notNull().default(0),
  /** Running counter used to generate human-friendly patient codes (P-000123). */
  patientSeq: integer().notNull().default(0),
  /** Running counter for the clinic's own lab reports (L-000123). */
  labSeq: integer().notNull().default(0),
  ...timestamps,
});

export const appUser = pgTable(
  "app_user",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    phone: text(),
    name: text().notNull(),
    passwordHash: text().notNull(),
    platformRole: platformRole(),
    disabled: boolean().notNull().default(false),
    lastLoginAt: timestamp({ withTimezone: true }),
    /** Base32 TOTP secret; null until the user enables MFA. Never granted to rx_app. */
    totpSecret: text(),
    totpEnabledAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("app_user_email_uq").on(sql`lower(${t.email})`)],
);

export const membership = pgTable(
  "membership",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    userId: uuid()
      .notNull()
      .references(() => appUser.id),
    role: tenantRole().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("membership_uq").on(t.tenantId, t.userId)],
);

/** One-time self-serve password reset tokens (hashed). Owner DB only — never synced. */
export const passwordReset = pgTable(
  "password_reset",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => appUser.id),
    tokenHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("password_reset_user_idx").on(t.userId), uniqueIndex("password_reset_token_uq").on(t.tokenHash)],
);

export const doctorProfile = pgTable(
  "doctor_profile",
  {
    userId: uuid()
      .primaryKey()
      .references(() => appUser.id),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    nameEn: text().notNull(),
    nameBn: text(),
    degreesEn: text().array().notNull().default(sql`'{}'::text[]`),
    degreesBn: text().array().notNull().default(sql`'{}'::text[]`),
    designation: text(),
    institution: text(),
    specialtyCode: text()
      .notNull()
      .default("general")
      .references(() => specialty.code),
    specialtyLabel: text(),
    bmdcNumber: text().notNull(),
    bmdcExpiry: date(),
    /** Set by a platform admin after checking BMDC registration and degrees. */
    bmdcVerifiedAt: timestamp({ withTimezone: true }),
    bmdcVerifiedBy: uuid().references(() => appUser.id),
    signatureDataUrl: text(),
    /** Sakura Web login for this doctor (admin-managed; not synced to clients). */
    sakuraPhone: text(),
    sakuraPassword: text(),
    ...timestamps,
  },
  (t) => [uniqueIndex("doctor_profile_bmdc_uq").on(sql`upper(${t.bmdcNumber})`)],
);

export const chamber = pgTable(
  "chamber",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    doctorUserId: uuid().references(() => appUser.id),
    name: text().notNull(),
    address: text().notNull(),
    /** Room number inside the hospital/diagnostic centre, printed between the name and the address. */
    room: text(),
    phone: text(),
    hours: text(),
    /** @rx/core ChamberSlot[]: visiting days/times, operation days etc. */
    schedule: jsonb().notNull().default([]),
    /** Phone for booking a serial, printed separately from the chamber phone. */
    serialPhone: text(),
    /** Policy line printed in the footer, e.g. free report showing within 5 working days. */
    footerText: text(),
    /** Hospital/clinic logo for the letterhead (small PNG/JPEG data URL). */
    logoDataUrl: text(),
    /** Working days after a consultation in which showing reports needs no fee (null = no such rule). */
    freeReportDays: integer(),
    /** Fee (৳) charged when the visit is “report showing”, unless the free-report window applies. */
    reportFee: integer(),
    /** @rx/core PrintSettings */
    printSettings: jsonb().notNull().default({}),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [index("chamber_tenant_idx").on(t.tenantId)],
);

export const patient = pgTable(
  "patient",
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    code: text(),
    name: text().notNull(),
    dob: date(),
    /** True when dob was back-calculated from an age the patient told us. */
    dobEstimated: boolean().notNull().default(false),
    sex: sexEnum(),
    mobile: text(),
    address: text(),
    nid: text(),
    brn: text(),
    healthId: text(),
    /** Neonatal history, printed in the Note section for children under 2. */
    birthWeightKg: real(),
    gestationalAgeWeeks: integer(),
    allergies: text().array().notNull().default(sql`'{}'::text[]`),
    /** none | pregnant | lactating | both — drives pregnancy-category CDS at prescribe time. */
    pregnancyStatus: text(),
    notes: text(),
    /** PDPA: explicit consent for storing health data; guardian consent for minors. */
    consentAt: timestamp({ withTimezone: true }),
    /** Consent to keep photos/PDFs of their reports (asked once, before the first one). */
    reportFilesConsentAt: timestamp({ withTimezone: true }),
    guardianName: text(),
    /** Referring doctor named at registration; pre-fills the first prescription's Ref By. */
    referredBy: text(),
    createdBy: uuid(),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("patient_tenant_mobile_idx").on(t.tenantId, t.mobile),
    index("patient_tenant_name_trgm").using("gin", sql`lower(${t.name}) gin_trgm_ops`),
    uniqueIndex("patient_tenant_code_uq").on(t.tenantId, t.code),
  ],
);

/** A visit. The assistant may create it (queue + vitals); the doctor writes the prescription. */
export const encounter = pgTable(
  "encounter",
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    patientId: uuid()
      .notNull()
      .references(() => patient.id),
    doctorUserId: uuid()
      .notNull()
      .references(() => appUser.id),
    chamberId: uuid().references(() => chamber.id),
    visitDate: date().notNull(),
    serialNo: integer(),
    status: encounterStatus().notNull().default("waiting"),
    specialtyCode: text().notNull().default("general"),
    templateId: uuid().references(() => specialtyTemplate.id),
    /** @rx/core Vitals */
    vitals: jsonb().notNull().default({}),
    /** Answers to the specialty template, keyed by field id. */
    examFindings: jsonb().notNull().default({}),
    fee: integer(),
    visitType: visitType(),
    createdBy: uuid(),
    ...timestamps,
  },
  (t) => [
    index("encounter_tenant_date_idx").on(t.tenantId, t.visitDate),
    index("encounter_patient_idx").on(t.patientId),
  ],
);

export const prescription = pgTable(
  "prescription",
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    encounterId: uuid()
      .notNull()
      .references(() => encounter.id),
    patientId: uuid()
      .notNull()
      .references(() => patient.id),
    doctorUserId: uuid()
      .notNull()
      .references(() => appUser.id),
    chamberId: uuid().references(() => chamber.id),
    version: integer().notNull().default(1),
    /** Previous version this one replaces (a finalised prescription is never edited in place). */
    supersedesId: uuid(),
    status: prescriptionStatus().notNull().default("draft"),
    /** @rx/core PrescriptionDoc */
    doc: jsonb().notNull(),
    finalizedAt: timestamp({ withTimezone: true }),
    /** Random token for the QR verification URL. */
    verifyToken: text(),
    ...timestamps,
  },
  (t) => [
    index("prescription_patient_idx").on(t.patientId),
    index("prescription_tenant_created_idx").on(t.tenantId, t.createdAt),
    uniqueIndex("prescription_verify_uq").on(t.verifyToken),
  ],
);

/**
 * A lab report: a paper report the patient brought (CBC, sugar, X-ray…, source "external"), or one the clinic's
 * own lab made (source "in_house": one row per panel of a request, sharing request_id and lab_no).
 * Results are @rx/core LabResult[] (coded values with units, the reference range and H/L flags).
 */
export const labReport = pgTable(
  "lab_report",
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    patientId: uuid()
      .notNull()
      .references(() => patient.id),
    /** The visit it was entered at; its prescription prints the report's ticked values. */
    encounterId: uuid().references(() => encounter.id),
    reportDate: date().notNull(),
    labName: text(),
    /** @rx/core LabPanel id, or "other" for a free-text report. */
    panel: text().notNull(),
    title: text().notNull(),
    results: jsonb().notNull().default([]),
    conclusion: text(),
    /** @rx/core LabFileRef[]: photos/PDFs of the paper report, stored in lab_file. */
    files: jsonb().notNull().default([]),
    source: text().notNull().default("external"),
    /** In-house: the request (one patient's tests taken together) this panel belongs to. */
    requestId: uuid(),
    /** In-house: assigned by the server on upload, shared by the request's rows. */
    labNo: text(),
    /** @rx/core LabDepartment of the panel. */
    department: text(),
    specimen: text(),
    collectedAt: timestamp({ withTimezone: true }),
    referredBy: text(),
    /** Who entered it, as printed ("Prepared by"); set by the server. */
    preparedByName: text(),
    /** Who verified the report for release; set by the server when a doctor/admin verifies. */
    verifiedByName: text(),
    verifiedAt: timestamp({ withTimezone: true }),
    comment: text(),
    createdBy: uuid(),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("lab_report_patient_idx").on(t.patientId, t.reportDate),
    index("lab_report_encounter_idx").on(t.encounterId),
    index("lab_report_request_idx").on(t.requestId),
  ],
);

/**
 * The lab test catalogue. Platform rows (no tenant) are the curated default, written by `pnpm db:seed:labs`;
 * a clinic's row with the same code changes that test for the clinic (null columns inherit, is_active false hides
 * it), and one with a new code is the clinic's own test. Devices merge them (@rx/core buildLabCatalogue).
 */
export const labTest = pgTable(
  "lab_test",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid().references(() => tenant.id),
    code: text().notNull(),
    name: text(),
    short: text(),
    unit: text(),
    /** @rx/core LabTestKind. */
    kind: text(),
    department: text(),
    sortOrder: integer(),
    isActive: boolean().notNull().default(true),
    /** @rx/core LabTestSpec: options, ranges, aliases… */
    spec: jsonb().notNull().default({}),
    /** "rx-curated" (the seed keeps it current), "admin" (edited by the platform; the seed leaves it), "clinic". */
    source: text().notNull().default("clinic"),
    updatedBy: uuid(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("lab_test_platform_code_uq").on(t.code).where(sql`${t.tenantId} is null`),
    uniqueIndex("lab_test_tenant_code_uq").on(t.tenantId, t.code).where(sql`${t.tenantId} is not null`),
    check("lab_test_platform_complete", sql`${t.tenantId} is not null or (${t.name} is not null and ${t.short} is not null and ${t.kind} is not null)`),
  ],
);

/** Lab panels (what is reported together), platform and clinic rows as for lab_test, keyed by `key`. */
export const labPanel = pgTable(
  "lab_panel",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid().references(() => tenant.id),
    key: text().notNull(),
    name: text(),
    department: text(),
    sortOrder: integer(),
    isActive: boolean().notNull().default(true),
    /** @rx/core LabPanelSpec: sections, specimen, layout… */
    spec: jsonb().notNull().default({}),
    source: text().notNull().default("clinic"),
    updatedBy: uuid(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("lab_panel_platform_key_uq").on(t.key).where(sql`${t.tenantId} is null`),
    uniqueIndex("lab_panel_tenant_key_uq").on(t.tenantId, t.key).where(sql`${t.tenantId} is not null`),
    check("lab_panel_platform_complete", sql`${t.tenantId} is not null or ${t.name} is not null`),
  ],
);

/** How a clinic's lab reports are headed and signed. One per clinic; its id is the tenant's. */
export const labProfile = pgTable("lab_profile", {
  id: uuid().primaryKey(),
  tenantId: uuid()
    .notNull()
    .unique()
    .references(() => tenant.id),
  labName: text(),
  address: text(),
  phone: text(),
  logoDataUrl: text(),
  /** [{ name, degrees, title }] printed at the foot of the report. */
  signatories: jsonb().notNull().default([]),
  footerText: text(),
  printSettings: jsonb().notNull().default({}),
  ...timestamps,
});

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/**
 * A photo or PDF of a lab report. Server-only: devices upload it through /api/lab-files and fetch it on demand;
 * it is not synced. lab_report_id has no foreign key because a file taken offline may arrive before its report.
 * Deleting wipes the bytes and keeps the row for the record.
 */
export const labFile = pgTable(
  "lab_file",
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    patientId: uuid()
      .notNull()
      .references(() => patient.id),
    labReportId: uuid().notNull(),
    contentType: text().notNull(),
    sizeBytes: integer().notNull(),
    sha256: text().notNull(),
    data: bytea().notNull(),
    createdBy: uuid(),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("lab_file_report_idx").on(t.labReportId)],
);

/** Flattened Rx lines, written server-side when a prescription is finalised (reporting only). */
export const prescriptionItem = pgTable(
  "prescription_item",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    prescriptionId: uuid()
      .notNull()
      .references(() => prescription.id),
    position: integer().notNull(),
    productId: uuid().references(() => brandProduct.id),
    brandName: text().notNull(),
    genericName: text(),
    instruction: text().notNull(),
  },
  (t) => [index("prescription_item_rx_idx").on(t.prescriptionId), index("prescription_item_product_idx").on(t.productId)],
);

/** Rx templates: tenantId null = shared by platform admin; ownerUserId null = shared in tenant. */
export const rxTemplate = pgTable(
  "rx_template",
  {
    id: uuid().primaryKey(),
    tenantId: uuid().references(() => tenant.id),
    ownerUserId: uuid().references(() => appUser.id),
    specialtyCode: text().references(() => specialty.code),
    name: text().notNull(),
    /** Partial @rx/core PrescriptionDoc (items, advice, investigations, diagnoses...). */
    payload: jsonb().notNull(),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [index("rx_template_tenant_idx").on(t.tenantId)],
);

export const doctorFavorite = pgTable(
  "doctor_favorite",
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    userId: uuid()
      .notNull()
      .references(() => appUser.id),
    productId: uuid()
      .notNull()
      .references(() => brandProduct.id),
    /** Default shortcut, e.g. "1+0+1 af 7d". */
    defaultShortcut: text(),
    useCount: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("doctor_favorite_uq").on(t.userId, t.productId)],
);

/**
 * A medicine a doctor added that is not in the catalogue. Until a platform admin approves it, only its owner sees
 * it (the sync pull filters by owner). Approving copies it into brand_product under the same id, or points it at an
 * existing product (`approved_product_id`); a rejected one stays private to its owner.
 */
export const customMedicine = pgTable(
  "custom_medicine",
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    ownerUserId: uuid()
      .notNull()
      .references(() => appUser.id),
    brandName: text().notNull(),
    formId: uuid().references(() => dosageForm.id),
    strengthText: text(),
    /** As the doctor typed it, e.g. "Paracetamol + Caffeine". */
    genericText: text(),
    /** Generics picked from the catalogue; empty when the doctor only typed `generic_text`. */
    genericIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    companyId: uuid().references(() => company.id),
    /** Free-text company when it is not in the catalogue. */
    companyName: text(),
    status: customMedicineStatus().notNull().default("pending"),
    reviewNote: text(),
    reviewedBy: uuid(),
    reviewedAt: timestamp({ withTimezone: true }),
    approvedProductId: uuid().references(() => brandProduct.id),
    ...timestamps,
  },
  (t) => [
    index("custom_medicine_owner_idx").on(t.tenantId, t.ownerUserId),
    index("custom_medicine_status_idx").on(t.status, t.createdAt),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid(),
    tenantId: uuid(),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: text(),
    before: jsonb(),
    after: jsonb(),
    ip: text(),
  },
  (t) => [index("audit_log_tenant_at_idx").on(t.tenantId, t.at), index("audit_log_entity_idx").on(t.entity, t.entityId)],
);

export const importJob = pgTable("import_job", {
  id: uuid().primaryKey().defaultRandom(),
  kind: text().notNull(), // "medicine_csv"
  filename: text().notNull(),
  source: text().notNull(),
  status: text().notNull().default("previewed"), // previewed | committed | failed
  summary: jsonb().notNull().default({}),
  createdBy: uuid(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  committedAt: timestamp({ withTimezone: true }),
});
