import { describe, expect, it } from "vitest";
import { LAB_TEST_BY_CODE, labPrintCells, labResult, renderLabReportHtml, type LabPrintInput } from "../src";

const T = (code: string) => LAB_TEST_BY_CODE[code]!;
const fonts = { bengali: "", latin: "" };
const base: LabPrintInput = {
  profile: { labName: "Shapla Diagnostic", address: "Station Road, Faridpur", phone: "01700-000000", signatories: [{ name: "Dr. A. Karim", degrees: "MBBS, M.Phil (Pathology)", title: "Consultant pathologist" }] },
  patient: { name: "Rahima Begum", ageYears: 34, sex: "female", patientCode: "P-000123", mobile: "01711000000" },
  labNo: "L-000042",
  referredBy: "Dr. Farhana Rahman",
  preparedBy: "Salma (assistant)",
  reportDate: "2026-10-09",
  collectedAt: "2026-10-09T03:30:00Z",
  fonts,
  reports: [
    { title: "CBC", department: "haematology", specimen: "Blood (EDTA)", results: [
      labResult(T("718-7"), { value: 9.2 }, "female"),
      labResult(T("6690-2"), { value: 11800, section: "Total count" }, "female"),
      labResult(T("777-3"), { value: 250000, section: "Total count" }, "female"),
    ] },
    { title: "Urine R/M/E", department: "clinical_pathology", results: [
      labResult(T("5778-6"), { text: "Pale yellow", section: "Physical examination" }, "female"),
      labResult(T("5821-4"), { text: "8-10", section: "Microscopic examination" }, "female"),
    ], comment: "Repeat after treatment" },
  ],
};

describe("lab report print", () => {
  it("prints counts per cmm and values to the test's decimals", () => {
    expect(labPrintCells(labResult(T("6690-2"), { value: 11800 }, "male"))).toEqual({ value: "11,800", unit: "/cumm", ref: "4,000–11,000" });
    expect(labPrintCells(labResult(T("2160-0"), { value: 1.6 }, "male"))).toMatchObject({ value: "1.60", unit: "mg/dL", ref: "0.6–1.2" });
    expect(labPrintCells(labResult(T("5821-4"), { text: "2-4" }, "male"))).toMatchObject({ value: "2-4", unit: "/HPF" });
  });

  it("prints one page per department, with the lab, patient, sample and signatures", () => {
    const html = renderLabReportHtml(base);
    expect(html.match(/class="sheet"/g)).toHaveLength(2);
    expect(html.indexOf("Haematology report")).toBeLessThan(html.indexOf("Clinical pathology report"));
    for (const s of ["Shapla Diagnostic", "L-000042", "P-000123", "Rahima Begum", "34 Y / Female", "Dr. Farhana Rahman", "09/10/2026 09:30", "Salma (assistant)", "M.Phil (Pathology)", "Specimen: Blood (EDTA)"]) {
      expect(html).toContain(s);
    }
    expect(html).toContain("<svg"); // Lab No barcode
  });

  it("marks abnormal results and prints sections and comments", () => {
    const html = renderLabReportHtml(base);
    expect(html).toContain('<tr class="abn"><td>Hb</td><td class="val">9.2 <span class="flag">L</span></td><td>g/dL</td><td>12–15</td></tr>');
    expect(html).toContain('<tr class="abn"><td>WBC</td><td class="val">11,800 <span class="flag">H</span></td><td>/cumm</td><td>4,000–11,000</td></tr>');
    expect(html).toContain('<tr class="sec"><td colspan="4">Microscopic examination</td></tr>');
    expect(html).toContain("<b>Comment:</b> Repeat after treatment");
  });

  it("prints a culture with its sensitivity table, or No growth", () => {
    const culture = labResult(T("630-4"), { culture: { growth: true, organisms: [{ name: "Escherichia coli", count: ">10⁵ CFU/mL", sensitivity: [{ drug: "Nitrofurantoin", sir: "S" }, { drug: "Ciprofloxacin", sir: "R", zone: "12" }] }] } }, "female");
    const html = renderLabReportHtml({ ...base, reports: [{ title: "Urine C/S", department: "microbiology", layout: "culture", results: [culture] }] });
    expect(html).toContain("<i>Escherichia coli</i>");
    expect(html).toContain('<tr class="sir-R"><td>Ciprofloxacin</td><td>Resistant</td><td>12</td></tr>');
    const none = renderLabReportHtml({ ...base, reports: [{ title: "Urine C/S", department: "microbiology", results: [labResult(T("630-4"), { culture: { growth: false, organisms: [] } }, "female")] }] });
    expect(none).toContain("<b>No growth</b>");
  });

  it("escapes everything typed by people", () => {
    const evil = "<img src=x onerror=alert(1)>";
    const html = renderLabReportHtml({
      ...base,
      profile: { labName: evil, signatories: [{ name: evil }], footerText: evil, logoDataUrl: "javascript:alert(1)" },
      patient: { ...base.patient, name: evil },
      referredBy: evil,
      reports: [{ title: evil, department: "microbiology", specimen: evil, comment: evil, results: [
        { ...labResult(T("664-3"), { text: evil }, "female"), name: evil },
        labResult(T("630-4"), { culture: { growth: true, organisms: [{ name: evil, count: evil, sensitivity: [{ drug: evil, sir: "S", zone: evil }] }] } }, "female"),
      ] }],
    });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});
