import type { LabPanel, LabTest } from "../lab-types";
import { BIOCHEMISTRY_PANELS, BIOCHEMISTRY_TESTS } from "./biochemistry";
import { CLINICAL_PATHOLOGY_PANELS, CLINICAL_PATHOLOGY_TESTS } from "./clinical-pathology";
import { HAEMATOLOGY_PANELS, HAEMATOLOGY_TESTS } from "./haematology";
import { HORMONE_PANELS, HORMONE_TESTS } from "./hormone-tumour-coagulation";
import { MICROBIOLOGY_PANELS, MICROBIOLOGY_TESTS } from "./microbiology";
import { SEROLOGY_PANELS, SEROLOGY_TESTS } from "./serology";

/**
 * The curated lab catalogue: the tests Bangladeshi labs offer, with LOINC codes where one exists ("bd-…" otherwise),
 * BD units and usual adult ranges. It is the platform default the seed script writes to the database
 * (`pnpm db:seed:labs`); clinics adjust their copy there. Codes are permanent once released: results are stored
 * under them. Ranges must be reviewed by a clinician before a production seed.
 */
export const LAB_CURATED_TESTS: LabTest[] = [
  ...HAEMATOLOGY_TESTS,
  ...BIOCHEMISTRY_TESTS,
  ...CLINICAL_PATHOLOGY_TESTS,
  ...SEROLOGY_TESTS,
  ...HORMONE_TESTS,
  ...MICROBIOLOGY_TESTS,
];

/** The panels the visit card always offered come first: a test's panel is the first one listing it. */
const FIRST = ["cbc", "sugar", "rft", "lft", "lipid", "thyroid", "urine", "electrolytes", "serology"];
const ALL = [...HAEMATOLOGY_PANELS, ...BIOCHEMISTRY_PANELS, ...CLINICAL_PATHOLOGY_PANELS, ...SEROLOGY_PANELS, ...HORMONE_PANELS, ...MICROBIOLOGY_PANELS];

export const LAB_CURATED_PANELS: LabPanel[] = [
  ...FIRST.map((id) => ALL.find((p) => p.id === id)!),
  ...ALL.filter((p) => !FIRST.includes(p.id)),
];
