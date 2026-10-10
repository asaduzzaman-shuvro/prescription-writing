/**
 * Global medicine catalogue, maintained by the platform admin team.
 * Every row carries provenance (`source`, `sourceRef`) and is never hard-deleted.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const medicineSystem = pgEnum("medicine_system", ["allopathic", "herbal", "ayurvedic", "unani", "homeopathic"]);
export const awareGroup = pgEnum("aware_group", ["access", "watch", "reserve"]);
export const interactionSeverity = pgEnum("interaction_severity", ["minor", "moderate", "major", "contraindicated"]);

const provenance = {
  source: text().notNull(),
  sourceRef: text(),
  isActive: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid(),
};

export const company = pgTable(
  "company",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    ...provenance,
  },
  (t) => [uniqueIndex("company_name_uq").on(sql`lower(${t.name})`)],
);

export const dosageForm = pgTable(
  "dosage_form",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    /** Printed prefix, e.g. "Tab.", "Cap.", "Syp.", "Ear Drop". */
    shortLabel: text(),
    /** Default route/unit used to pre-fill the Rx line (values from @rx/core Route / DoseUnit). */
    defaultRoute: text(),
    defaultUnit: text(),
    ...provenance,
  },
  (t) => [uniqueIndex("dosage_form_name_uq").on(sql`lower(${t.name})`)],
);

export const drugClass = pgTable(
  "drug_class",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    ...provenance,
  },
  (t) => [uniqueIndex("drug_class_name_uq").on(sql`lower(${t.name})`)],
);

export const generic = pgTable(
  "generic",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    synonyms: text().array().notNull().default(sql`'{}'::text[]`),
    isAntibiotic: boolean().notNull().default(false),
    awareGroup: awareGroup(),
    pregnancyCategory: text(),
    /** Optional max daily dose for weight-based paediatric checks (mg/kg/day). */
    paedMaxMgPerKgDay: numeric({ precision: 10, scale: 3 }),
    adultMaxMgPerDay: numeric({ precision: 10, scale: 3 }),
    ...provenance,
  },
  (t) => [
    uniqueIndex("generic_name_uq").on(sql`lower(${t.name})`),
    index("generic_name_trgm").using("gin", sql`lower(${t.name}) gin_trgm_ops`),
  ],
);

export const genericDrugClass = pgTable(
  "generic_drug_class",
  {
    genericId: uuid()
      .notNull()
      .references(() => generic.id),
    drugClassId: uuid()
      .notNull()
      .references(() => drugClass.id),
  },
  (t) => [primaryKey({ columns: [t.genericId, t.drugClassId] })],
);

export const genericMonograph = pgTable("generic_monograph", {
  genericId: uuid()
    .primaryKey()
    .references(() => generic.id),
  indications: text(),
  dosage: text(),
  administration: text(),
  contraindications: text(),
  sideEffects: text(),
  interactions: text(),
  pregnancyLactation: text(),
  precautions: text(),
  paediatricUse: text(),
  /** Format of the text fields: "html" for the dev seed, "text" for curated entries. */
  format: text().notNull().default("text"),
  source: text().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const brandProduct = pgTable(
  "brand_product",
  {
    id: uuid().primaryKey().defaultRandom(),
    brandName: text().notNull(),
    formId: uuid().references(() => dosageForm.id),
    companyId: uuid().references(() => company.id),
    /** Strength as printed, e.g. "500 mg" or "(10 mg+30 mg)/5 ml". */
    strengthText: text(),
    /** DGDA registration (DAR) number; required to link to the national FHIR registry later. */
    darNumber: text(),
    medicineSystem: medicineSystem().notNull().default("allopathic"),
    /** Denormalised "Paracetamol + Caffeine", maintained by the catalogue service. */
    genericText: text().notNull().default(""),
    discontinuedAt: timestamp({ withTimezone: true }),
    ...provenance,
  },
  (t) => [
    uniqueIndex("brand_product_dar_uq").on(t.darNumber),
    index("brand_product_brand_trgm").using("gin", sql`lower(${t.brandName}) gin_trgm_ops`),
    index("brand_product_generic_trgm").using("gin", sql`lower(${t.genericText}) gin_trgm_ops`),
    index("brand_product_brand_prefix").on(sql`lower(${t.brandName}) text_pattern_ops`),
    index("brand_product_company_idx").on(t.companyId),
  ],
);

export const productIngredient = pgTable(
  "product_ingredient",
  {
    productId: uuid()
      .notNull()
      .references(() => brandProduct.id),
    position: smallint().notNull(),
    genericId: uuid()
      .notNull()
      .references(() => generic.id),
    strengthValue: numeric({ precision: 14, scale: 4 }),
    strengthUnit: text(),
    /** Per-unit basis such as "5 ml" for liquids. */
    basis: text(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.position] }), index("product_ingredient_generic_idx").on(t.genericId)],
);

export const productPack = pgTable(
  "product_pack",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => brandProduct.id),
    description: text().notNull(),
    packSize: text(),
    mrp: numeric({ precision: 12, scale: 2 }),
    priceDate: date(),
    priceSource: text().notNull(),
    /** True when the price is a government-fixed maximum retail price. */
    govtFixed: boolean().notNull().default(false),
  },
  (t) => [index("product_pack_product_idx").on(t.productId)],
);

/** Pairwise generic interactions; each pair stored once with genericA < genericB. */
export const genericInteraction = pgTable(
  "generic_interaction",
  {
    id: uuid().primaryKey().defaultRandom(),
    genericA: uuid()
      .notNull()
      .references(() => generic.id),
    genericB: uuid()
      .notNull()
      .references(() => generic.id),
    severity: interactionSeverity().notNull(),
    effect: text().notNull(),
    management: text(),
    reviewedBy: text(),
    ...provenance,
  },
  (t) => [
    uniqueIndex("generic_interaction_pair_uq").on(t.genericA, t.genericB),
    check("generic_interaction_order", sql`${t.genericA} < ${t.genericB}`),
  ],
);

// ---------------------------------------------------------------------------
// Clinical libraries (pick-lists for the doctor panel)
// ---------------------------------------------------------------------------

export const specialty = pgTable("specialty", {
  code: text().primaryKey(), // "general", "ent"
  name: text().notNull(),
  nameBn: text(),
});

const libraryCols = {
  id: uuid().primaryKey().defaultRandom(),
  /** null = all specialties. */
  specialtyCode: text().references(() => specialty.code),
  sortOrder: integer().notNull().default(0),
  ...provenance,
};

export const investigation = pgTable("investigation", {
  ...libraryCols,
  name: text().notNull(),
  category: text(), // "Haematology", "Imaging", "Audiology" ...
});

export const diagnosis = pgTable("diagnosis", {
  ...libraryCols,
  name: text().notNull(),
  icd10: text(),
  icd11: text(),
});

export const complaint = pgTable("complaint", {
  ...libraryCols,
  name: text().notNull(),
  nameBn: text(),
});

/** Common history lines (H/O DM, Smoker…) suggested in the visit's History list. */
export const historyItem = pgTable("history_item", {
  ...libraryCols,
  name: text().notNull(),
  category: text(), // "Past", "Drug", "Family", "Social", "Surgical", "Obstetric"
});

export const adviceSnippet = pgTable("advice_snippet", {
  ...libraryCols,
  textBn: text().notNull(),
  textEn: text(),
  category: text(),
});

export const instructionSnippet = pgTable("instruction_snippet", {
  ...libraryCols,
  textBn: text().notNull(),
  textEn: text(),
});

/**
 * Admin-defined structured exam template for a specialty (e.g. ENT ear/nose/throat).
 * `schema` follows @rx/core SpecialtyTemplateSchema; encounters store answers in exam_findings.
 */
export const specialtyTemplate = pgTable(
  "specialty_template",
  {
    id: uuid().primaryKey().defaultRandom(),
    specialtyCode: text()
      .notNull()
      .references(() => specialty.code),
    name: text().notNull(),
    version: integer().notNull().default(1),
    schema: text().notNull(), // JSON; stored as text so it syncs verbatim to clients
    ...provenance,
  },
  (t) => [uniqueIndex("specialty_template_uq").on(t.specialtyCode, t.name, t.version)],
);
