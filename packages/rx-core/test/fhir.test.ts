import { describe, expect, it } from "vitest";
import { prescriptionToFhir, SAMPLE_DOC } from "../src";

const input = (dar: string | null) => ({
  baseUrl: "https://rx.example.bd",
  prescription: { id: "rx1", finalizedAt: "2026-10-05T08:00:00Z", verifyToken: "tok123", version: 1, doc: { ...SAMPLE_DOC, items: SAMPLE_DOC.items.map((x, n) => ({ ...x, productId: `p${n}` })) } },
  patient: { id: "pt1", name: "Md. Abdul Karim", sex: "male" as const, dob: "1992-01-01", mobile: "01711000000", code: "P-000123", nid: "1234567890", brn: null, healthId: null, address: null },
  doctor: { userId: "d1", nameEn: "Dr. X", bmdcNumber: "A-12345", degreesEn: ["MBBS"] },
  encounter: { id: "e1", visitDate: "2026-10-05" },
  darByProduct: { p0: dar, p1: null, p2: null, p3: null },
  icd10ByDiagnosis: { "Acute pharyngitis": "J02.9" },
});

describe("prescriptionToFhir", () => {
  it("builds a collection bundle with one MedicationRequest per Rx line", () => {
    const { bundle } = prescriptionToFhir(input("353-0026-039"));
    const types = (bundle.entry as { resource: { resourceType: string } }[]).map((e) => e.resource.resourceType);
    expect(types.filter((t) => t === "MedicationRequest")).toHaveLength(4);
    expect(types).toContain("Patient");
    expect(types.filter((t) => t === "Condition")).toHaveLength(2);
  });
  it("codes DAR products against the DGDA registry and claims the profile only then", () => {
    const { bundle, gaps } = prescriptionToFhir(input("353-0026-039"));
    const meds = (bundle.entry as { resource: Record<string, any> }[]).map((e) => e.resource).filter((r) => r.resourceType === "Medication");
    expect(meds[0].code.coding[0]).toEqual({ system: "https://dgda.gov.bd/drug-registry", code: "353-0026-039--napa-extend" });
    expect(meds[0].meta.profile[0]).toBe("https://fhir.dghs.gov.bd/core/StructureDefinition/bd-medication");
    expect(meds[1].meta).toBeUndefined();
    expect(gaps).toContain('Medication "Moxacil": no DAR number in catalogue — bd-medication not claimed');
    expect(gaps).toContain("Patient: UHID (Health ID) missing — bd-patient profile not claimed");
  });
  it("carries the NID identifier and bilingual dosage text", () => {
    const { bundle } = prescriptionToFhir(input(null));
    const res = (bundle.entry as { resource: Record<string, any> }[]).map((e) => e.resource);
    expect(res.find((r) => r.resourceType === "Patient")!.identifier).toContainEqual({ system: "http://dghs.gov.bd/identifier/nid", value: "1234567890" });
    const mr = res.find((r) => r.resourceType === "MedicationRequest")!;
    expect(mr.dosageInstruction[0].patientInstruction).toBe("১+০+১ — খাবারের পরে — ৫ দিন");
    expect(mr.dosageInstruction[0].timing.repeat).toMatchObject({ frequency: 2, period: 1, periodUnit: "d" });
  });
});
