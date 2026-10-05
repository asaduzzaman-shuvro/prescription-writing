/**
 * FHIR R4 export of a finalised prescription, aligned with the DGHS Bangladesh Core IG (v0.4.6,
 * informative). A DGHS profile is only claimed in meta.profile when the resource carries that
 * profile's mandatory elements; everything missing is reported in `gaps` so nobody mistakes the
 * export for a conformant submission.
 */
import { formatInstruction } from "./dose";
import type { PrescriptionDoc, RxItem } from "./types";

const IG = "https://fhir.dghs.gov.bd/core/StructureDefinition";
export const FHIR_SYSTEMS = {
  nid: "http://dghs.gov.bd/identifier/nid",
  brn: "http://dghs.gov.bd/identifier/brn",
  uhid: "http://dghs.gov.bd/identifier/uhid",
  dgdaDrug: "https://dgda.gov.bd/drug-registry",
  /** Local systems (not defined by DGHS) — namespaced under the deployment URL. */
  bmdc: (base: string) => `${base}/fhir/identifier/bmdc`,
  rx: (base: string) => `${base}/fhir/identifier/prescription`,
  patientCode: (base: string) => `${base}/fhir/identifier/patient-code`,
  icd10: "http://hl7.org/fhir/sid/icd-10",
} as const;

export interface FhirInput {
  baseUrl: string;
  prescription: { id: string; finalizedAt: string; verifyToken: string | null; version: number; doc: PrescriptionDoc };
  patient: { id: string; name: string; sex: "male" | "female" | "other" | null; dob: string | null; mobile: string | null; code: string | null; nid: string | null; brn: string | null; healthId: string | null; address: string | null };
  doctor: { userId: string; nameEn: string; bmdcNumber: string; degreesEn: string[] };
  encounter: { id: string; visitDate: string };
  /** DAR number per productId, when the catalogue has it. */
  darByProduct: Record<string, string | null>;
  /** ICD-10 code per diagnosis label, when the library has it. */
  icd10ByDiagnosis: Record<string, string | null>;
}

type Resource = Record<string, unknown> & { resourceType: string; id: string };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const ROUTE_SNOMED: Partial<Record<NonNullable<RxItem["route"]>, [string, string]>> = {
  oral: ["26643006", "Oral route"],
  ear: ["10547007", "Otic route"],
  nose: ["46713006", "Nasal route"],
  eye: ["54485002", "Ophthalmic route"],
  topical: ["6064005", "Topical route"],
  inhalation: ["447694001", "Respiratory tract route"],
  injection: ["78421000", "Intramuscular route"],
  rectal: ["37161004", "Rectal route"],
  vaginal: ["16857009", "Vaginal route"],
  sublingual: ["37839007", "Sublingual route"],
};

function timing(it: RxItem): Record<string, unknown> | undefined {
  const f = it.frequency;
  const bounds = it.duration.kind === "fixed" ? { boundsDuration: { value: it.duration.value, unit: it.duration.unit, system: "http://unitsofmeasure.org", code: { day: "d", week: "wk", month: "mo" }[it.duration.unit] } } : {};
  if (f.kind === "pattern") return { repeat: { frequency: f.slots.filter((x) => x > 0).length, period: 1, periodUnit: "d", ...bounds } };
  if (f.kind === "times_per_day") return { repeat: { frequency: f.times, period: 1, periodUnit: "d", ...bounds } };
  if (f.kind === "every_hours") return { repeat: { frequency: 1, period: f.hours, periodUnit: "h", ...bounds } };
  if (f.kind === "weekly") return { repeat: { frequency: f.times, period: 1, periodUnit: "wk", ...bounds } };
  return undefined;
}

export interface FhirExport {
  bundle: Record<string, unknown>;
  gaps: string[];
}

export function prescriptionToFhir(i: FhirInput): FhirExport {
  const gaps: string[] = [];
  const { patient: p, doctor: d, prescription: rx } = i;
  const ref = (r: Resource) => ({ reference: `${r.resourceType}/${r.id}` });

  // Patient
  const identifiers = [
    p.healthId && { system: FHIR_SYSTEMS.uhid, value: p.healthId },
    p.nid && { system: FHIR_SYSTEMS.nid, value: p.nid },
    p.brn && { system: FHIR_SYSTEMS.brn, value: p.brn },
    p.code && { system: FHIR_SYSTEMS.patientCode(i.baseUrl), value: p.code },
  ].filter(Boolean);
  const patientMissing = [!p.healthId && "UHID (Health ID)", !p.sex && "gender", !p.address && "address", "religion extension", "father/mother RelatedPerson"].filter(Boolean) as string[];
  gaps.push(...patientMissing.map((m) => `Patient: ${m} missing — bd-patient profile not claimed`));
  const patient: Resource = {
    resourceType: "Patient",
    id: p.id,
    identifier: identifiers,
    name: [{ use: "official", text: p.name }],
    ...(p.sex && { gender: p.sex }),
    ...(p.dob && { birthDate: p.dob }),
    ...(p.mobile && { telecom: [{ system: "phone", value: p.mobile, use: "mobile" }] }),
    ...(p.address && { address: [{ text: p.address, country: "BD" }] }),
  };

  const practitioner: Resource = {
    resourceType: "Practitioner",
    id: d.userId,
    identifier: [{ system: FHIR_SYSTEMS.bmdc(i.baseUrl), value: d.bmdcNumber }],
    name: [{ text: d.nameEn }],
    qualification: d.degreesEn.map((q) => ({ code: { text: q } })),
  };
  gaps.push("Practitioner: BMDC identifier system is local (no DGHS system published) — bd-practitioner not claimed");

  const encounter: Resource = {
    resourceType: "Encounter",
    id: i.encounter.id,
    status: "finished",
    class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB", display: "ambulatory" },
    subject: ref(patient),
    participant: [{ individual: ref(practitioner) }],
    period: { start: i.encounter.visitDate },
  };

  const conditions: Resource[] = rx.doc.diagnoses.map((label, n) => {
    const icd = i.icd10ByDiagnosis[label];
    if (!icd) gaps.push(`Condition "${label}": no ICD code (DGHS IG expects ICD-11)`);
    return {
      resourceType: "Condition",
      id: `${rx.id}-dx-${n + 1}`,
      clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] },
      code: { ...(icd && { coding: [{ system: FHIR_SYSTEMS.icd10, code: icd }] }), text: label },
      subject: ref(patient),
      encounter: ref(encounter),
    };
  });

  const medications: Resource[] = [];
  const requests: Resource[] = rx.doc.items.map((it, n) => {
    const dar = it.productId ? i.darByProduct[it.productId] : null;
    const med: Resource = {
      resourceType: "Medication",
      id: `${rx.id}-med-${n + 1}`,
      ...(dar && { meta: { profile: [`${IG}/bd-medication`] } }),
      code: { ...(dar && { coding: [{ system: FHIR_SYSTEMS.dgdaDrug, code: `${dar}--${slug(it.brandName)}` }] }), text: it.brandName },
      ...(it.genericName && { ingredient: it.genericName.split(" + ").map((g) => ({ itemCodeableConcept: { text: g } })) }),
    };
    if (!dar) gaps.push(`Medication "${it.brandName}": no DAR number in catalogue — bd-medication not claimed`);
    medications.push(med);
    const route = it.route ? ROUTE_SNOMED[it.route] : undefined;
    return {
      resourceType: "MedicationRequest",
      id: `${rx.id}-rx-${n + 1}`,
      ...(dar && { meta: { profile: [`${IG}/bd-medication-request`] } }),
      identifier: [{ system: FHIR_SYSTEMS.rx(i.baseUrl), value: `${rx.verifyToken ?? rx.id}-${n + 1}` }],
      status: "active",
      intent: "order",
      medicationReference: ref(med),
      subject: ref(patient),
      encounter: ref(encounter),
      authoredOn: rx.finalizedAt,
      requester: ref(practitioner),
      dosageInstruction: [
        {
          sequence: n + 1,
          text: formatInstruction(it, "en", "en"),
          patientInstruction: formatInstruction(it, "bn", "bn"),
          ...(timing(it) && { timing: timing(it) }),
          ...(route && { route: { coding: [{ system: "http://snomed.info/sct", code: route[0], display: route[1] }] } }),
          ...(it.doseQty && it.doseUnit && { doseAndRate: [{ doseQuantity: { value: it.doseQty, unit: it.doseUnit } }] }),
        },
      ],
    };
  });

  const entries = [patient, practitioner, encounter, ...conditions, ...medications, ...requests].map((r) => ({ fullUrl: `urn:uuid:${r.id}`, resource: r }));
  return {
    bundle: {
      resourceType: "Bundle",
      id: rx.id,
      type: "collection",
      timestamp: rx.finalizedAt,
      identifier: { system: FHIR_SYSTEMS.rx(i.baseUrl), value: rx.verifyToken ?? rx.id },
      entry: entries,
    },
    gaps,
  };
}
